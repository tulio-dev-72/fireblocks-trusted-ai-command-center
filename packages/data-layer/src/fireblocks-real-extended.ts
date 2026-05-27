import type { FireblocksCallContext } from "@taicc/fireblocks-client";
import type {
  ApprovalWorkflowRecord,
  BalanceRecord,
  TransactionRecord,
  ProvenanceRecord,
} from "@taicc/shared-types";
import { wrapList, unavailableRecord } from "./provenance.js";
import { FireblocksRealAdapter } from "./fireblocks-real-adapter.js";

const PENDING_STATUSES = new Set([
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
]);

const DELAYED_STATUSES = new Set([
  ...PENDING_STATUSES,
  "FAILED",
]);

export class FireblocksRealAdapterExtended extends FireblocksRealAdapter {
  async listBalances(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<BalanceRecord[]>> {
    const vaults = await this.listVaultAccounts(ctx);
    if (!vaults.available || !vaults.data) {
      return unavailableRecord<BalanceRecord[]>(
        "REAL_FIREBLOCKS",
        vaults.unavailable_reason ?? "Balances unavailable — vault accounts not reachable",
        "GET /vault/accounts_paged",
      );
    }

    const balances: BalanceRecord[] = [];
    for (const vault of vaults.data) {
      for (const asset of vault.assets) {
        balances.push({
          vaultAccountId: vault.id,
          vaultAccountName: vault.name,
          assetId: asset.id,
          total: asset.total,
          available: asset.available,
        });
      }
    }

    return wrapList(balances, {
      ...vaults.provenance,
      api_endpoint: "GET /vault/accounts_paged (balances derived)",
    });
  }

  async listApprovals(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<ApprovalWorkflowRecord[]>> {
    const txResult = await this.listTransactions(ctx);
    if (!txResult.available || !txResult.data) {
      return {
        data: null,
        available: false,
        unavailable_reason:
          txResult.unavailable_reason ??
          "Approval queue unavailable — could not retrieve transactions",
        provenance: txResult.provenance,
      };
    }

    const approvals = txResult.data
      .filter((tx) => isPendingApproval(tx))
      .map((tx) => mapTransactionToApproval(tx));

    return wrapList(approvals, {
      ...txResult.provenance,
      api_endpoint: "GET /transactions (approval queue derived from pending statuses)",
    });
  }

  async listDelayedTransactions(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<TransactionRecord[]>> {
    const txResult = await this.listTransactions(ctx);
    if (!txResult.available || !txResult.data) return txResult;

    const delayed = txResult.data.filter((tx) => DELAYED_STATUSES.has(tx.status));
    return wrapList(delayed, {
      ...txResult.provenance,
      api_endpoint: "GET /transactions (delayed filter)",
    });
  }
}

function isPendingApproval(tx: TransactionRecord): boolean {
  return (
    PENDING_STATUSES.has(tx.status) ||
    tx.status.includes("PENDING") ||
    tx.status.includes("AUTHORIZATION")
  );
}

function mapTransactionToApproval(tx: TransactionRecord): ApprovalWorkflowRecord {
  return {
    id: tx.id,
    status: tx.status,
    operation: "TRANSACTION",
    approver: undefined,
    createdAt: tx.createdAt ? new Date(tx.createdAt).toISOString() : undefined,
    expiresAt: undefined,
  };
}

export { PENDING_STATUSES, DELAYED_STATUSES };
