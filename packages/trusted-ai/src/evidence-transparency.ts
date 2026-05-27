import type {
  ApprovalWorkflowRecord,
  BalanceRecord,
  DelayedPaymentsInvestigationResponse,
  DelayedTransactionGroup,
  EvidenceCard,
  EvidenceItem,
  EvidenceGraphEdge,
  EvidenceGraphNode,
  EvidenceSourceBreakdown,
  InvestigationTransparency,
  OperationalSeverity,
  TransactionRecord,
} from "@taicc/shared-types";
import { OperationalSeverityLabels } from "@taicc/shared-types";

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function extractVaultIds(balances: BalanceRecord[]): string[] {
  return [...new Set(balances.map((b) => b.vaultAccountId).filter(Boolean))] as string[];
}

export function buildEvidenceSourceBreakdown(
  evidence: EvidenceItem[],
  webhookEventCount: number,
): EvidenceSourceBreakdown {
  const breakdown: EvidenceSourceBreakdown = {
    REAL_FIREBLOCKS_SANDBOX: 0,
    WEBHOOK_EVENTS: webhookEventCount,
    POLICY_RECORDS: 0,
    APPROVAL_RECORDS: 0,
    DERIVED_AI: 0,
    DEMO_SEED: 0,
  };

  for (const item of evidence) {
    const st = item.provenance.source_type;
    const n = item.available ? Math.max(1, countArray(item.value)) : 0;

    if (st === "DEMO_SEED") {
      breakdown.DEMO_SEED += n;
      continue;
    }
    if (st === "DERIVED_AI") {
      breakdown.DERIVED_AI += n;
      continue;
    }

    if (item.id === "ev-txs" || item.id === "ev-balances") {
      breakdown.REAL_FIREBLOCKS_SANDBOX += n;
    } else if (item.id === "ev-approvals") {
      breakdown.APPROVAL_RECORDS += n;
    } else if (item.id === "ev-policy") {
      breakdown.POLICY_RECORDS += n;
    } else if (st === "REAL_FIREBLOCKS" || st === "REAL_FIREBLOCKS_SANDBOX") {
      breakdown.REAL_FIREBLOCKS_SANDBOX += n;
    }
  }

  if (breakdown.DERIVED_AI === 0) breakdown.DERIVED_AI = 1;

  return breakdown;
}

export function classifyOperationalSeverity(input: {
  delayGroups: DelayedTransactionGroup[];
  delayedCount: number;
  pendingApprovals: number;
  transactionCount: number;
  evidenceAvailable: number;
}): { severity: OperationalSeverity; rationale: string } {
  if (input.evidenceAvailable === 0 || input.transactionCount === 0) {
    return {
      severity: "insufficient_evidence",
      rationale:
        "Limited or no Fireblocks sandbox transactions retrieved — severity cannot be fully assessed.",
    };
  }

  const byReason = new Map(input.delayGroups.map((g) => [g.reason, g.count]));
  const liquidity = byReason.get("insufficient_balance") ?? 0;
  const approval = byReason.get("approval_pending") ?? 0;
  const network = byReason.get("network_delay") ?? 0;
  const failed = byReason.get("failed_transfer") ?? 0;

  if (liquidity > 0) {
    return {
      severity: "critical_liquidity_constraint",
      rationale: `${liquidity} transaction(s) blocked by insufficient vault balance — liquidity action required.`,
    };
  }
  if (approval > 0 || input.pendingApprovals > 0) {
    return {
      severity: "moderate_approval_bottleneck",
      rationale: `${Math.max(approval, input.pendingApprovals)} item(s) awaiting authorization in Fireblocks.`,
    };
  }
  if (network > 0 || failed > 0 || input.delayedCount >= 3) {
    return {
      severity: "elevated_settlement_latency",
      rationale: `${input.delayedCount} non-final transaction(s) affecting settlement timelines.`,
    };
  }
  return {
    severity: "low_operational_risk",
    rationale: "No critical delay patterns detected in retrieved Fireblocks evidence.",
  };
}

export function buildEvidenceGraph(input: {
  transactions: TransactionRecord[];
  delayGroups: DelayedTransactionGroup[];
  vaultIds: string[];
  pendingApprovals: number;
  webhookEventCount: number;
  hasPolicy: boolean;
}): { nodes: EvidenceGraphNode[]; edges: EvidenceGraphEdge[] } {
  const nodes: EvidenceGraphNode[] = [];
  const edges: EvidenceGraphEdge[] = [];

  for (const tx of input.transactions.slice(0, 8)) {
    nodes.push({
      id: `tx-${tx.id}`,
      kind: "transaction",
      label: `${tx.id.slice(0, 10)}… (${tx.status})`,
      ref_id: tx.id,
      source_type: "REAL_FIREBLOCKS_SANDBOX",
    });
  }

  for (const vaultId of input.vaultIds.slice(0, 5)) {
    nodes.push({
      id: `vault-${vaultId}`,
      kind: "vault",
      label: `Vault ${vaultId.slice(0, 8)}…`,
      ref_id: vaultId,
      source_type: "REAL_FIREBLOCKS_SANDBOX",
    });
  }

  if (input.pendingApprovals > 0) {
    nodes.push({
      id: "approval-queue",
      kind: "approval",
      label: `Approval queue (${input.pendingApprovals})`,
      source_type: "REAL_FIREBLOCKS_SANDBOX",
    });
  }

  if (input.hasPolicy) {
    nodes.push({
      id: "policy-active",
      kind: "policy",
      label: "Active Fireblocks policy",
      source_type: "REAL_FIREBLOCKS_SANDBOX",
    });
  }

  if (input.webhookEventCount > 0) {
    nodes.push({
      id: "webhooks",
      kind: "webhook",
      label: `Webhook events (${input.webhookEventCount})`,
      source_type: "REAL_FIREBLOCKS_SANDBOX",
    });
  }

  for (const group of input.delayGroups) {
    nodes.push({
      id: `finding-${group.reason}`,
      kind: "finding",
      label: `${group.label} (${group.count})`,
      ref_id: group.reason,
      source_type: "DERIVED_AI",
    });
    for (const txId of group.transaction_ids.slice(0, 3)) {
      edges.push({
        from: `tx-${txId}`,
        to: `finding-${group.reason}`,
        relation: "root_cause",
      });
    }
  }

  for (const tx of input.transactions.slice(0, 5)) {
    const src = tx.source as { id?: string } | undefined;
    const dst = tx.destination as { id?: string } | undefined;
    if (src?.id) {
      edges.push({ from: `vault-${src.id}`, to: `tx-${tx.id}`, relation: "source" });
    }
    if (dst?.id) {
      edges.push({ from: `tx-${tx.id}`, to: `vault-${dst.id}`, relation: "destination" });
    }
    if (input.pendingApprovals > 0 && tx.status.includes("PENDING")) {
      edges.push({ from: `tx-${tx.id}`, to: "approval-queue", relation: "awaiting_approval" });
    }
    if (input.hasPolicy) {
      edges.push({ from: "policy-active", to: `tx-${tx.id}`, relation: "policy_scope" });
    }
  }

  if (input.webhookEventCount > 0) {
    for (const tx of input.transactions.slice(0, 2)) {
      edges.push({ from: "webhooks", to: `tx-${tx.id}`, relation: "operational_signal" });
    }
  }

  return { nodes, edges };
}

export function enrichEvidenceCards(
  cards: EvidenceCard[],
  transactions: TransactionRecord[],
  approvals: ApprovalWorkflowRecord[],
): EvidenceCard[] {
  const txById = new Map(transactions.map((t) => [t.id, t]));
  const approvalByTx = new Map(
    approvals.filter((a) => a.id).map((a) => [a.id, a]),
  );

  return cards.map((card) => {
    const tx = card.transaction_id ? txById.get(card.transaction_id) : undefined;
    const src = tx?.source as { id?: string; type?: string } | undefined;
    const dst = tx?.destination as { id?: string; type?: string } | undefined;
    const ts = tx?.lastUpdated ?? tx?.createdAt;

    return {
      ...card,
      vault_id: src?.type === "VAULT_ACCOUNT" ? src.id : dst?.type === "VAULT_ACCOUNT" ? dst.id : undefined,
      source_vault_id: src?.type === "VAULT_ACCOUNT" ? src.id : undefined,
      destination_id: dst?.id,
      timestamp: ts != null ? new Date(ts).toISOString() : undefined,
      approval_state:
        tx?.status.includes("PENDING") || tx?.status.includes("AUTHORIZATION")
          ? "pending_authorization"
          : tx?.status,
      policy_reference: card.reason === "policy_blocked" ? "ev-policy" : undefined,
      provenance: {
        ...card.provenance,
        source_type:
          card.provenance.source_type === "REAL_FIREBLOCKS"
            ? "REAL_FIREBLOCKS_SANDBOX"
            : card.provenance.source_type,
      },
      details: tx
        ? {
            tx_hash: tx.txHash,
            note: tx.note,
            amount_usd: tx.amountUSD,
            approval_record: card.transaction_id
              ? approvalByTx.get(card.transaction_id)?.status
              : undefined,
          }
        : undefined,
    };
  });
}

export function buildInvestigationTransparency(
  result: Omit<DelayedPaymentsInvestigationResponse, "transparency">,
  input: {
    webhookEventCount: number;
    transactions: TransactionRecord[];
    balances: BalanceRecord[];
    approvals: ApprovalWorkflowRecord[];
    policyAvailable: boolean;
    transactionCount: number;
  },
): InvestigationTransparency {
  const sourceBreakdown = buildEvidenceSourceBreakdown(result.evidence, input.webhookEventCount);
  const partiallySimulated = sourceBreakdown.DEMO_SEED > 0;
  const vaultIds = extractVaultIds(input.balances);
  const transactionIds = [
    ...new Set([
      ...result.delay_groups.flatMap((g) => g.transaction_ids),
      ...input.transactions.map((t) => t.id),
    ]),
  ];

  const { severity, rationale } = classifyOperationalSeverity({
    delayGroups: result.delay_groups,
    delayedCount: result.delayed_payment_count,
    pendingApprovals: result.pending_approval_count,
    transactionCount: input.transactionCount,
    evidenceAvailable: result.evidence.filter((e) => e.available).length,
  });

  const limitedActivity =
    input.transactionCount === 0
      ? "No Fireblocks sandbox transactions retrieved. Operational investigations return partial evidence until sandbox activity exists."
      : input.transactionCount < 3
        ? "Limited Fireblocks sandbox activity detected. Operational investigations may return partial evidence until additional sandbox transactions are created."
        : undefined;

  const graph = buildEvidenceGraph({
    transactions: input.transactions,
    delayGroups: result.delay_groups,
    vaultIds,
    pendingApprovals: result.pending_approval_count,
    webhookEventCount: input.webhookEventCount,
    hasPolicy: input.policyAvailable,
  });

  const approvalStates = input.approvals.map((a) => `${a.id}:${a.status}`).slice(0, 20);

  return {
    source_breakdown: sourceBreakdown,
    partially_simulated: partiallySimulated,
    limited_activity_warning: limitedActivity,
    operational_severity: severity,
    severity_rationale: rationale,
    provenance: {
      model_provider: result.model_provider,
      model_id: result.model_id,
      evidence_count: result.evidence.filter((e) => e.available).length,
      source_breakdown: sourceBreakdown,
      retrieval_timestamp: result.provenance.fetched_at,
      confidence: result.analysis?.confidence ?? "medium",
      missing_evidence: result.analysis?.missing_evidence ?? [],
      partially_simulated: partiallySimulated,
      ai_transparency: {
        evidence_backed: result.citations.length > 0,
        audit_logged: result.prompt_logged,
        rbac_enforced: result.rbac_enforced,
        read_only_fireblocks: true,
        no_autonomous_execution: true,
      },
    },
    graph_nodes: graph.nodes,
    graph_edges: graph.edges,
    traceable_ids: {
      transaction_ids: transactionIds,
      vault_ids: vaultIds,
      evidence_ids: result.evidence.map((e) => e.id),
      approval_states: approvalStates,
      policy_references: input.policyAvailable ? ["ev-policy"] : [],
    },
  };
}

export { OperationalSeverityLabels };
