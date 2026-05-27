import type { AuditLogger } from "@taicc/audit";
import type { EnvConfig } from "@taicc/config";
import type { DataService } from "@taicc/data-layer";
import type { FireblocksCallContext } from "@taicc/fireblocks-client";
import type {
  Actor,
  BalanceRecord,
  DelayReason,
  DelayedPaymentsInvestigationResponse,
  DelayedTransactionGroup,
  EvidenceCard,
  EscalationSummaryResponse,
  InvestigationMode,
  TransactionRecord,
  TreasuryRecommendation,
} from "@taicc/shared-types";
import {
  groupDelayedTransactions,
  isDelayedTransaction,
  reasonLabel,
  reasonSummary,
} from "./delay-classifier.js";
import {
  buildEvidenceContext,
  generateGroundedAnswer,
  resolveLlmConfig,
} from "./llm-provider.js";
import { buildInstitutionalAnalysis, formatInstitutionalAnswer } from "./institutional-analysis.js";
import {
  buildInvestigationTransparency,
  enrichEvidenceCards,
} from "./evidence-transparency.js";

export class DelayedPaymentsWorkflow {
  constructor(
    private readonly dataService: DataService,
    private readonly auditLogger: AuditLogger,
    private readonly config: EnvConfig,
  ) {}

  async investigate(
    question: string,
    actor: Actor,
    fbCtx: FireblocksCallContext,
    rbacAllowed: boolean,
    mode: InvestigationMode = "operations",
    webhookEventCount = 0,
  ): Promise<DelayedPaymentsInvestigationResponse> {
    const correlationId = fbCtx.correlationId;

    await this.auditLogger.record({
      correlationId,
      eventType: "workflow_executed",
      actorId: actor.id,
      action: "delayed_payments_investigator",
      outcome: "success",
      metadata: { question, phase: "start", mode },
    });

    if (!rbacAllowed) {
      throw new Error("RBAC denied: operations:read required for Delayed Payments Investigator");
    }

    if (this.dataService.getMode() === "demo") {
      throw new Error(
        "Delayed Payments Investigator requires REAL_FIREBLOCKS=true.",
      );
    }

    const [txResult, approvalResult, balanceResult, policyResult] =
      await Promise.all([
        this.dataService.listTransactions(fbCtx),
        this.dataService.listApprovals(fbCtx),
        this.dataService.listBalances(fbCtx),
        this.dataService.getActivePolicy(fbCtx),
      ]);

    const txPack = this.dataService.toAiEvidence("Transactions", txResult, "ev-txs");
    const approvalPack = this.dataService.toAiEvidence(
      "Approval Queue",
      approvalResult,
      "ev-approvals",
    );
    const balancePack = this.dataService.toAiEvidence(
      "Vault Balances",
      balanceResult,
      "ev-balances",
    );
    const policyPack = this.dataService.toAiEvidence("Active Policy", policyResult, "ev-policy");

    const evidence = [
      txPack.item,
      approvalPack.item,
      balancePack.item,
      policyPack.item,
    ];

    for (const item of evidence) {
      await this.auditLogger.record({
        correlationId,
        eventType: "evidence_retrieved",
        actorId: actor.id,
        resourceType: item.label,
        outcome: item.available ? "success" : "failure",
        metadata: {
          evidenceId: item.id,
          workflow: "delayed_payments_investigator",
          source_type: item.provenance.source_type,
          rbac_filtered: !item.available,
        },
      });
    }

    const transactions = txPack.filtered.available ? (txPack.filtered.data ?? []) : [];
    const balances = balancePack.filtered.available ? (balancePack.filtered.data ?? []) : [];
    const approvals = approvalPack.filtered.available ? (approvalPack.filtered.data ?? []) : [];
    const pendingApprovals = approvals.filter((a) =>
      a.status.includes("PENDING") || a.status.includes("AUTHORIZATION"),
    );

    const grouped = groupDelayedTransactions(transactions, balances);
    const delayGroups = buildDelayGroups(grouped);
    const evidenceCards = enrichEvidenceCards(
      buildEvidenceCards(transactions, balances),
      transactions,
      approvals,
    );
    const recommendations = buildWorkflowRecommendations(delayGroups, pendingApprovals.length);

    const groupLines = delayGroups.map(
      (g) => `${g.label}: ${g.count} — ${g.summary}`,
    );
    const { context, citations } = buildEvidenceContext(evidence, groupLines);

    const llmConfig = resolveLlmConfig(this.config);
    await this.auditLogger.record({
      correlationId,
      eventType: "ai_prompt",
      actorId: actor.id,
      action: "delayed_payments_investigator",
      outcome: "success",
      metadata: {
        question,
        mode,
        model_provider: llmConfig.provider,
        prompt_logged: llmConfig.promptLogging,
      },
    });

    const llmResult = await generateGroundedAnswer(
      { question, context, citations, mode },
      llmConfig,
    );

    const delayedCount = transactions.filter(isDelayedTransaction).length;
    const explanation = buildStructuredExplanation(delayGroups, delayedCount, pendingApprovals.length);

    const auditEvent = await this.auditLogger.record({
      correlationId,
      eventType: "ai_response",
      actorId: actor.id,
      action: "delayed_payments_investigator",
      outcome: "success",
      metadata: {
        delayed_count: delayedCount,
        group_count: delayGroups.length,
        model_provider: llmResult.provider,
        mode,
      },
    });

    await this.auditLogger.record({
      correlationId,
      eventType: "workflow_executed",
      actorId: actor.id,
      action: "delayed_payments_investigator",
      outcome: "success",
      metadata: {
        question,
        phase: "complete",
        mode,
        delayed_count: delayedCount,
        delay_groups: delayGroups.map((g) => ({ reason: g.reason, label: g.label, count: g.count })),
        recommended_actions: recommendations.map((r) => r.action),
      },
    });

    const analysis = buildInstitutionalAnalysis({
      question,
      answer: llmResult.answer,
      citations,
      evidence,
      correlationId,
      auditEventId: auditEvent.id,
      delaySummary: `${delayedCount} delayed payment(s); ${pendingApprovals.length} pending approval(s).`,
      mode,
    });

    const baseResult = {
      workflow: "delayed_payments_investigator" as const,
      question,
      summary: `${delayedCount} delayed payment(s) across ${delayGroups.length} root-cause group(s); ${pendingApprovals.length} pending approval(s).`,
      ai_answer: formatInstitutionalAnswer(analysis),
      explanation,
      analysis,
      delay_groups: delayGroups,
      evidence_cards: evidenceCards,
      evidence,
      citations,
      recommendations,
      delayed_payment_count: delayedCount,
      pending_approval_count: pendingApprovals.length,
      model_provider: llmResult.provider,
      model_id: llmConfig.modelId,
      prompt_logged: llmConfig.promptLogging,
      rbac_enforced: true,
      provenance: {
        source_type: "DERIVED_AI" as const,
        fetched_at: new Date().toISOString(),
        api_endpoint: "POST /v1/workflows/delayed-payments/investigate",
        mocked_fields: [] as string[],
        correlation_id: correlationId,
      },
      correlation_id: correlationId,
      audit_event_id: auditEvent.id,
    };

    const transparency = buildInvestigationTransparency(baseResult, {
      webhookEventCount,
      transactions,
      balances,
      approvals,
      policyAvailable: policyPack.item.available,
      transactionCount: transactions.length,
    });

    return { ...baseResult, transparency };
  }

  async prepareEscalationSummary(
    correlationId: string,
    actor: Actor,
    investigationSummary?: string,
  ): Promise<EscalationSummaryResponse> {
    const events = await this.auditLogger.query({ correlationId, limit: 50 });
    const workflowEvents = events.filter(
      (e) =>
        e.action === "delayed_payments_investigator" ||
        e.eventType === "ai_response",
    );

    const auditEvent = await this.auditLogger.record({
      correlationId,
      eventType: "escalation_prepared",
      actorId: actor.id,
      action: "prepare_escalation_summary",
      outcome: "success",
      metadata: {
        draft_only: true,
        no_execution: true,
        investigation_summary: investigationSummary?.slice(0, 500),
      },
    });

    const completeEvent = events.find(
      (e) =>
        e.action === "delayed_payments_investigator" &&
        e.metadata?.phase === "complete",
    );
    const delayGroupsMeta = completeEvent?.metadata?.delay_groups as
      | Array<{ label: string; count: number }>
      | undefined;
    const storedActions = completeEvent?.metadata?.recommended_actions as string[] | undefined;

    const delayedMeta = workflowEvents.find((e) => e.metadata?.delayed_count != null);
    const delayedCount = Number(delayedMeta?.metadata?.delayed_count ?? 0);

    const topReasons =
      delayGroupsMeta && delayGroupsMeta.length > 0
        ? delayGroupsMeta.map((g) => `${g.label} (${g.count})`)
        : delayedCount > 0
          ? [`${delayedCount} non-final transaction(s) — re-run investigator for root-cause breakdown`]
          : ["No delayed payments in current Fireblocks sandbox history"];

    const recommendedActions =
      storedActions && storedActions.length > 0
        ? storedActions
        : [
            "Review Fireblocks approval queue with authorized signers",
            "Validate policy rules affecting held transactions",
          ];

    return {
      title: "Treasury Escalation Summary — Delayed Payments",
      summary:
        investigationSummary ??
        `Escalation draft for correlation ${correlationId}. ${delayedCount} delayed payment(s) from Fireblocks evidence. Draft only — human approval required before any outbound action.`,
      delayed_count: delayedCount,
      top_reasons: topReasons,
      recommended_actions: recommendedActions,
      evidence_refs: ["ev-txs", "ev-approvals", "ev-balances", "ev-policy"],
      prepared_at: new Date().toISOString(),
      correlation_id: correlationId,
      audit_event_id: auditEvent.id,
      draft_only: true,
    };
  }
}

function buildDelayGroups(
  grouped: Map<DelayReason, TransactionRecord[]>,
): DelayedTransactionGroup[] {
  const order = [
    "approval_pending",
    "policy_blocked",
    "insufficient_balance",
    "failed_transfer",
    "network_delay",
  ] as const;

  return order
    .filter((reason) => grouped.has(reason))
    .map((reason) => {
      const txs = grouped.get(reason)!;
      return {
        reason,
        label: reasonLabel(reason),
        count: txs.length,
        transaction_ids: txs.map((t) => t.id),
        summary: reasonSummary(reason, txs.length),
      };
    });
}

function buildEvidenceCards(
  transactions: TransactionRecord[],
  balances: BalanceRecord[],
): EvidenceCard[] {
  const grouped = groupDelayedTransactions(transactions, balances);
  const cards: EvidenceCard[] = [];
  let idx = 0;

  for (const [reason, txs] of grouped.entries()) {
    for (const tx of txs.slice(0, 5)) {
      cards.push({
        id: `card-${idx++}`,
        title: reasonLabel(reason),
        subtitle: tx.note ?? `Transaction ${tx.id.slice(0, 8)}`,
        reason,
        transaction_id: tx.id,
        status: tx.status,
        amount: tx.amount != null ? String(tx.amount) : undefined,
        asset: tx.assetId,
        evidence_id: "ev-txs",
        provenance: {
          source_type: "REAL_FIREBLOCKS_SANDBOX",
          fetched_at: new Date().toISOString(),
          api_endpoint: "GET /transactions",
          mocked_fields: [],
        },
      });
    }
  }

  return cards;
}

function buildWorkflowRecommendations(
  groups: DelayedTransactionGroup[],
  pendingApprovalCount: number,
): TreasuryRecommendation[] {
  const recs: TreasuryRecommendation[] = [];

  for (const group of groups) {
    if (group.reason === "approval_pending") {
      recs.push({
        priority: "high",
        action: "Expedite approver review for pending authorization queue",
        rationale: group.summary,
      });
    }
    if (group.reason === "policy_blocked") {
      recs.push({
        priority: "high",
        action: "Engage compliance to release policy or AML holds",
        rationale: group.summary,
      });
    }
    if (group.reason === "insufficient_balance") {
      recs.push({
        priority: "high",
        action: "Fund source vault or reduce transfer amount before re-submitting draft",
        rationale: group.summary,
      });
    }
    if (group.reason === "failed_transfer") {
      recs.push({
        priority: "medium",
        action: "Investigate failed transfers and prepare re-submission draft (no auto-execution)",
        rationale: group.summary,
      });
    }
    if (group.reason === "network_delay") {
      recs.push({
        priority: "low",
        action: "Monitor network confirmation — typically resolves without intervention",
        rationale: group.summary,
      });
    }
  }

  if (pendingApprovalCount > 0 && !recs.some((r) => r.action.includes("approver"))) {
    recs.unshift({
      priority: "high",
      action: "Review Fireblocks approval queue with authorized signers",
      rationale: `${pendingApprovalCount} transaction(s) awaiting authorization`,
    });
  }

  return recs;
}

function buildStructuredExplanation(
  groups: DelayedTransactionGroup[],
  delayedCount: number,
  pendingApprovals: number,
): string {
  if (delayedCount === 0) {
    return "No delayed payments detected in the current Fireblocks sandbox transaction history.";
  }

  const parts = [
    `Identified ${delayedCount} non-final transaction(s) from live Fireblocks data.`,
    ...groups.map((g) => `${g.label}: ${g.count} (${g.summary})`),
  ];

  if (pendingApprovals > 0) {
    parts.push(`${pendingApprovals} item(s) in the approval queue require human sign-off.`);
  }

  return parts.join(" ");
}

export function createDelayedPaymentsWorkflow(
  dataService: DataService,
  auditLogger: AuditLogger,
  config: EnvConfig,
): DelayedPaymentsWorkflow {
  return new DelayedPaymentsWorkflow(dataService, auditLogger, config);
}
