import {
  DelayReasonLabels,
  type BalanceRecord,
  type TransactionRecord,
  type DelayReason,
} from "@taicc/shared-types";

const APPROVAL_STATUSES = new Set([
  "PENDING_AUTHORIZATION",
  "PENDING_SIGNATURE",
  "PENDING_3RD_PARTY",
  "PENDING_3RD_PARTY_MANUAL_APPROVAL",
  "QUEUED",
]);

const POLICY_STATUSES = new Set([
  "PENDING_AML_SCREENING",
  "PENDING_ENRICHMENT",
]);

const NETWORK_STATUSES = new Set(["BROADCASTING", "CONFIRMING"]);

export const DELAYED_STATUSES = new Set([
  "SUBMITTED",
  ...APPROVAL_STATUSES,
  ...POLICY_STATUSES,
  ...NETWORK_STATUSES,
  "FAILED",
]);

export function isDelayedTransaction(tx: TransactionRecord): boolean {
  return DELAYED_STATUSES.has(tx.status);
}

export function classifyDelayReason(
  tx: TransactionRecord,
  balances: BalanceRecord[],
): DelayReason {
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

export function reasonLabel(reason: DelayReason): string {
  return DelayReasonLabels[reason];
}

export function reasonSummary(reason: DelayReason, count: number): string {
  const labels: Record<DelayReason, string> = {
    approval_pending: `${count} payment(s) awaiting signer or approver action`,
    policy_blocked: `${count} payment(s) held by policy or compliance screening`,
    insufficient_balance: `${count} payment(s) may lack sufficient vault balance`,
    failed_transfer: `${count} payment(s) failed during execution`,
    network_delay: `${count} payment(s) in network confirmation or broadcast`,
  };
  return labels[reason];
}

export function groupDelayedTransactions(
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
