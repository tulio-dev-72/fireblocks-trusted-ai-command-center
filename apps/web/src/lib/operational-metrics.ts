import {
  DelayReasonLabels,
  type ApprovalWorkflowRecord,
  type BalanceRecord,
  type DelayReason,
  type TransactionRecord,
} from "@taicc/shared-types";

export interface ChartDatum {
  name: string;
  value: number;
  fill: string;
}

export interface OperationalChartData {
  settlement: ChartDatum[];
  delayCauses: ChartDatum[];
  approvals: ChartDatum[];
  liquidity: ChartDatum[];
  pendingAge: ChartDatum[];
}

const FINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "REJECTED", "BLOCKED"]);

const APPROVAL_STATUSES = new Set([
  "PENDING_AUTHORIZATION",
  "PENDING_SIGNATURE",
  "PENDING_3RD_PARTY",
  "PENDING_3RD_PARTY_MANUAL_APPROVAL",
  "QUEUED",
]);

const POLICY_STATUSES = new Set(["PENDING_AML_SCREENING", "PENDING_ENRICHMENT"]);
const NETWORK_STATUSES = new Set(["BROADCASTING", "CONFIRMING"]);

const DELAYED_STATUSES = new Set([
  "SUBMITTED",
  ...APPROVAL_STATUSES,
  ...POLICY_STATUSES,
  ...NETWORK_STATUSES,
  "FAILED",
]);

function isDelayedTransaction(tx: TransactionRecord): boolean {
  return DELAYED_STATUSES.has(tx.status);
}

function hasInsufficientBalance(
  vaultId: string,
  assetId: string,
  amount: number,
  balances: BalanceRecord[],
): boolean {
  const balance = balances.find(
    (b) => b.vaultAccountId === vaultId && b.assetId === assetId,
  );
  if (!balance?.available) return false;
  const available = parseFloat(balance.available);
  return !Number.isNaN(available) && available < amount;
}

function classifyDelayReason(tx: TransactionRecord, balances: BalanceRecord[]): DelayReason {
  if (tx.status === "FAILED") return "failed_transfer";
  if (APPROVAL_STATUSES.has(tx.status)) return "approval_pending";
  if (POLICY_STATUSES.has(tx.status)) return "policy_blocked";
  if (NETWORK_STATUSES.has(tx.status)) return "network_delay";
  if (tx.status === "SUBMITTED" && tx.assetId && tx.amount != null) {
    const vaultId =
      typeof tx.source === "object" && tx.source && "id" in tx.source
        ? String(tx.source.id)
        : undefined;
    if (vaultId && hasInsufficientBalance(vaultId, tx.assetId, tx.amount, balances)) {
      return "insufficient_balance";
    }
  }
  if (tx.status === "SUBMITTED") return "approval_pending";
  return "network_delay";
}

function groupDelayedTransactions(
  transactions: TransactionRecord[],
  balances: BalanceRecord[],
): Map<DelayReason, TransactionRecord[]> {
  const groups = new Map<DelayReason, TransactionRecord[]>();
  for (const tx of transactions.filter(isDelayedTransaction)) {
    const reason = classifyDelayReason(tx, balances);
    const list = groups.get(reason) ?? [];
    list.push(tx);
    groups.set(reason, list);
  }
  return groups;
}

function categorizeSettlement(status: string): string {
  if (status === "COMPLETED") return "Cleared";
  if (status === "FAILED") return "Failed";
  if (APPROVAL_STATUSES.has(status)) return "Awaiting approval";
  if (POLICY_STATUSES.has(status)) return "Policy / compliance hold";
  if (NETWORK_STATUSES.has(status)) return "Network confirmation";
  if (status === "SUBMITTED") return "Submitted / in flight";
  if (FINAL_STATUSES.has(status)) return "Closed (other)";
  return "Non-final (other)";
}

const SETTLEMENT_COLORS: Record<string, string> = {
  Cleared: "#64748b",
  "Awaiting approval": "#78716c",
  "Policy / compliance hold": "#92400e",
  "Network confirmation": "#475569",
  "Submitted / in flight": "#4b5563",
  Failed: "#991b1b",
  "Closed (other)": "#374151",
  "Non-final (other)": "#6b7280",
};

const DELAY_COLORS: Record<DelayReason, string> = {
  approval_pending: "#78716c",
  policy_blocked: "#92400e",
  insufficient_balance: "#991b1b",
  failed_transfer: "#7f1d1d",
  network_delay: "#475569",
};

/** Q: What is the current settlement pipeline composition? */
export function buildSettlementPipeline(transactions: TransactionRecord[]): ChartDatum[] {
  const counts = new Map<string, number>();
  for (const tx of transactions) {
    const bucket = categorizeSettlement(tx.status);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  const order = [
    "Awaiting approval",
    "Policy / compliance hold",
    "Submitted / in flight",
    "Network confirmation",
    "Failed",
    "Cleared",
    "Closed (other)",
    "Non-final (other)",
  ];

  return order
    .filter((name) => (counts.get(name) ?? 0) > 0)
    .map((name) => ({
      name,
      value: counts.get(name)!,
      fill: SETTLEMENT_COLORS[name] ?? "#6b7280",
    }));
}

/** Q: What root causes are blocking delayed payments? */
export function buildDelayRootCauses(
  transactions: TransactionRecord[],
  balances: BalanceRecord[],
): ChartDatum[] {
  const grouped = groupDelayedTransactions(transactions, balances);
  const order: DelayReason[] = [
    "approval_pending",
    "policy_blocked",
    "insufficient_balance",
    "failed_transfer",
    "network_delay",
  ];

  return order
    .filter((reason) => grouped.has(reason))
    .map((reason) => ({
      name: DelayReasonLabels[reason],
      value: grouped.get(reason)!.length,
      fill: DELAY_COLORS[reason],
    }));
}

/** Q: How many authorizations are pending vs completed? */
export function buildApprovalMonitor(approvals: ApprovalWorkflowRecord[]): ChartDatum[] {
  const counts = new Map<string, number>();
  for (const item of approvals) {
    const status = item.status.includes("PENDING") ? "Pending authorization" : item.status;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({
      name,
      value,
      fill: name.toLowerCase().includes("pending") ? "#78716c" : "#64748b",
    }));
}

/** Q: Where is available vault liquidity concentrated by asset? */
export function buildLiquidityConcentration(
  balances: BalanceRecord[],
  limit = 8,
): ChartDatum[] {
  const byAsset = new Map<string, number>();
  for (const row of balances) {
    const available = parseFloat(row.available ?? "0");
    if (Number.isNaN(available) || available <= 0) continue;
    byAsset.set(row.assetId, (byAsset.get(row.assetId) ?? 0) + available);
  }

  return [...byAsset.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([assetId, value]) => ({
      name: assetId,
      value: Math.round(value * 100) / 100,
      fill: "#546e7a",
    }));
}

/** Q: How long have non-final transactions been open? */
export function buildPendingAgeBuckets(transactions: TransactionRecord[]): ChartDatum[] {
  const now = Date.now();
  const buckets = [
    { name: "< 1 hour", maxMs: 3_600_000, fill: "#64748b" },
    { name: "1–24 hours", maxMs: 86_400_000, fill: "#78716c" },
    { name: "1–3 days", maxMs: 259_200_000, fill: "#92400e" },
    { name: "> 3 days", maxMs: Infinity, fill: "#991b1b" },
  ];
  const counts = buckets.map(() => 0);

  for (const tx of transactions.filter(isDelayedTransaction)) {
    if (!tx.createdAt) continue;
    const age = now - tx.createdAt;
    if (age < buckets[0].maxMs) counts[0]++;
    else if (age < buckets[1].maxMs) counts[1]++;
    else if (age < buckets[2].maxMs) counts[2]++;
    else counts[3]++;
  }

  return buckets
    .map((b, i) => ({ name: b.name, value: counts[i], fill: b.fill }))
    .filter((d) => d.value > 0);
}
