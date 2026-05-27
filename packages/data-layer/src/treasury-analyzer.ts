import type { AuditLogger } from "@taicc/audit";
import type { DataService } from "./data-service.js";
import type {
  TreasuryAnalysisResponse,
  EvidenceItem,
  TransactionRecord,
  TreasuryRecommendation,
} from "@taicc/shared-types";
import type { FireblocksCallContext } from "@taicc/fireblocks-client";

const DELAYED_STATUSES = new Set([
  "SUBMITTED",
  "PENDING_AML_SCREENING",
  "PENDING_ENRICHMENT",
  "PENDING_AUTHORIZATION",
  "QUEUED",
  "PENDING_SIGNATURE",
  "PENDING_3RD_PARTY",
  "PENDING_3RD_PARTY_MANUAL_APPROVAL",
  "BROADCASTING",
  "CONFIRMING",
  "FAILED",
]);

export class TreasuryAnalyzer {
  constructor(
    private readonly dataService: DataService,
    private readonly auditLogger: AuditLogger,
  ) {}

  async analyzePaymentDelays(
    question: string,
    ctx: FireblocksCallContext,
    actorId: string,
  ): Promise<TreasuryAnalysisResponse> {
    const correlationId = ctx.correlationId;

    await this.auditLogger.record({
      correlationId,
      eventType: "ai_prompt",
      actorId,
      action: "treasury_analyze",
      outcome: "success",
      metadata: { question, readOnly: true },
    });

    if (this.dataService.getMode() === "demo") {
      throw new Error(
        "Treasury analysis requires REAL_FIREBLOCKS=true. Demo seed data is not used for operational AI answers.",
      );
    }

    const [txResult, approvalResult, balanceResult] = await Promise.all([
      this.dataService.listTransactions(ctx),
      this.dataService.listApprovals(ctx),
      this.dataService.listBalances(ctx),
    ]);

    const evidence: EvidenceItem[] = [
      this.dataService.toEvidence("Transactions", txResult, "ev-txs"),
      this.dataService.toEvidence("Approval Queue", approvalResult, "ev-approvals"),
      this.dataService.toEvidence("Vault Balances", balanceResult, "ev-balances"),
    ];

    for (const item of evidence) {
      await this.auditLogger.record({
        correlationId,
        eventType: "evidence_retrieved",
        actorId,
        resourceType: item.label,
        outcome: item.available ? "success" : "failure",
        metadata: {
          evidenceId: item.id,
          source_type: item.provenance.source_type,
          available: item.available,
        },
      });
    }

    if (!txResult.available) {
      return this.unavailableAnalysis(
        question,
        correlationId,
        evidence,
        txResult.unavailable_reason ?? "Transaction data unavailable from Fireblocks sandbox",
      );
    }

    const transactions = txResult.data ?? [];
    const delayed = transactions.filter((tx) => DELAYED_STATUSES.has(tx.status));
    const pendingApprovals = (approvalResult.data ?? []).filter((a) =>
      a.status.includes("PENDING") || a.status.includes("AUTHORIZATION"),
    );

    const byStatus = groupByStatus(delayed);
    const explanation = buildExplanation(delayed, pendingApprovals, byStatus, balanceResult.data ?? []);
    const recommendations = buildRecommendations(delayed, pendingApprovals, byStatus);

    const response: TreasuryAnalysisResponse = {
      question,
      summary: `${delayed.length} delayed/non-final transaction(s); ${pendingApprovals.length} pending approval(s) in Fireblocks sandbox.`,
      explanation,
      delayed_payment_count: delayed.length,
      pending_approval_count: pendingApprovals.length,
      evidence,
      recommendations,
      provenance: {
        source_type: "DERIVED_AI",
        fetched_at: new Date().toISOString(),
        api_endpoint: "POST /v1/treasury/analyze",
        mocked_fields: [],
        correlation_id: correlationId,
      },
      correlation_id: correlationId,
    };

    return response;
  }

  private unavailableAnalysis(
    question: string,
    correlationId: string,
    evidence: EvidenceItem[],
    reason: string,
  ): TreasuryAnalysisResponse {
    return {
      question,
      summary: "Analysis unavailable — Fireblocks sandbox connection failed",
      explanation: reason,
      delayed_payment_count: 0,
      pending_approval_count: 0,
      evidence,
      recommendations: [
        {
          priority: "high",
          action: "Verify Fireblocks sandbox credentials and connection",
          rationale: reason,
        },
      ],
      provenance: {
        source_type: "DERIVED_AI",
        fetched_at: new Date().toISOString(),
        api_endpoint: "POST /v1/treasury/analyze",
        mocked_fields: [],
        correlation_id: correlationId,
      },
      correlation_id: correlationId,
    };
  }
}

function groupByStatus(txs: TransactionRecord[]): Record<string, TransactionRecord[]> {
  const groups: Record<string, TransactionRecord[]> = {};
  for (const tx of txs) {
    if (!groups[tx.status]) groups[tx.status] = [];
    groups[tx.status].push(tx);
  }
  return groups;
}

function buildExplanation(
  delayed: TransactionRecord[],
  pendingApprovals: { id: string; status: string }[],
  byStatus: Record<string, TransactionRecord[]>,
  _balances: unknown[],
): string {
  if (delayed.length === 0) {
    return "No delayed payments detected in the current Fireblocks sandbox transaction history. All recent transactions appear to have reached a final state.";
  }

  const statusSummary = Object.entries(byStatus)
    .map(([status, txs]) => `${status}: ${txs.length} transaction(s)`)
    .join("; ");

  const lines = [
    `Found ${delayed.length} transaction(s) in non-completed states from live Fireblocks sandbox data.`,
    `Status breakdown: ${statusSummary}.`,
  ];

  if (pendingApprovals.length > 0) {
    lines.push(
      `${pendingApprovals.length} transaction(s) are awaiting authorization or policy approval in the Fireblocks approval queue.`,
    );
  }

  if (byStatus.PENDING_AML_SCREENING?.length) {
    lines.push("AML screening delays may be holding payments — check compliance status in Fireblocks console.");
  }

  if (byStatus.PENDING_AUTHORIZATION?.length) {
    lines.push("Authorization delays indicate approvers have not yet signed off on pending transfers.");
  }

  if (byStatus.QUEUED?.length || byStatus.PENDING_SIGNATURE?.length) {
    lines.push("Queued or pending-signature states suggest co-signer or MPC signing workflow is in progress.");
  }

  return lines.join(" ");
}

function buildRecommendations(
  delayed: TransactionRecord[],
  pendingApprovals: { id: string; status: string }[],
  byStatus: Record<string, TransactionRecord[]>,
): TreasuryRecommendation[] {
  const recs: TreasuryRecommendation[] = [];

  if (pendingApprovals.length > 0) {
    recs.push({
      priority: "high",
      action: "Review pending approvals in Fireblocks console and Command Center approval queue",
      rationale: `${pendingApprovals.length} transaction(s) require authorization before execution`,
    });
  }

  if (byStatus.PENDING_AML_SCREENING?.length) {
    recs.push({
      priority: "high",
      action: "Investigate AML screening holds with compliance team",
      rationale: `${byStatus.PENDING_AML_SCREENING.length} transaction(s) blocked at AML screening`,
    });
  }

  if (byStatus.FAILED?.length) {
    recs.push({
      priority: "medium",
      action: "Review failed transactions and re-submit if appropriate (draft only — no auto-execution)",
      rationale: `${byStatus.FAILED.length} transaction(s) in FAILED state`,
    });
  }

  if (delayed.length > 0 && recs.length === 0) {
    recs.push({
      priority: "medium",
      action: "Monitor transaction statuses and check Fireblocks activity logs",
      rationale: `${delayed.length} transaction(s) not yet completed`,
    });
  }

  return recs;
}

export function createTreasuryAnalyzer(
  dataService: DataService,
  auditLogger: AuditLogger,
): TreasuryAnalyzer {
  return new TreasuryAnalyzer(dataService, auditLogger);
}
