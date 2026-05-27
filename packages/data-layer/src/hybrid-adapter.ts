import type { FireblocksCallContext } from "@taicc/fireblocks-client";
import type {
  VaultAccountRecord,
  ExternalWalletRecord,
  TransactionRecord,
  FireblocksPolicyRuleRecord,
  ApprovalWorkflowRecord,
  WebhookEventRecord,
  CounterpartyRecord,
  ActivityLogRecord,
  ProvenanceRecord,
  TransactionDraft,
} from "@taicc/shared-types";
import { FireblocksRealAdapterExtended } from "./fireblocks-real-extended.js";
import { wrapList } from "./provenance.js";

/**
 * Hybrid mode: real Fireblocks metadata where API access exists.
 * Mocked fields are explicitly labeled in provenance.mocked_fields.
 * Never silently substitutes demo data when real call fails.
 */
export class HybridAdapter {
  constructor(private readonly real: FireblocksRealAdapterExtended) {}

  async listVaultAccounts(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<VaultAccountRecord[]>> {
    const realResult = await this.real.listVaultAccounts(ctx);
    if (realResult.available && realResult.data && realResult.data.length > 0) {
      return realResult;
    }
    // Only enrich with demo if real returned empty — still label as hybrid unavailable
    if (!realResult.available) {
      return {
        ...realResult,
        unavailable_reason:
          realResult.unavailable_reason ??
          "Vault accounts unavailable from Fireblocks",
      };
    }
    return wrapList(realResult.data ?? [], {
      ...realResult.provenance,
      mocked_fields: [],
    });
  }

  async getVaultAccount(
    id: string,
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<VaultAccountRecord>> {
    return this.real.getVaultAccount(id, ctx);
  }

  async listExternalWallets(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<ExternalWalletRecord[]>> {
    return this.real.listExternalWallets(ctx);
  }

  async listTransactions(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<TransactionRecord[]>> {
    return this.real.listTransactions(ctx);
  }

  async getTransaction(
    id: string,
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<TransactionRecord>> {
    return this.real.getTransaction(id, ctx);
  }

  async getActivePolicy(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<FireblocksPolicyRuleRecord[]>> {
    return this.real.getActivePolicy(ctx);
  }

  async listApprovals(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<ApprovalWorkflowRecord[]>> {
    return this.real.listApprovals(ctx);
  }

  async listWebhookEvents(
    webhookId: string | undefined,
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<WebhookEventRecord[]>> {
    return this.real.listWebhookEvents(webhookId, ctx);
  }

  async listCounterparties(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<CounterpartyRecord[]>> {
    return this.real.listCounterparties(ctx);
  }

  async listActivityLogs(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<ActivityLogRecord[]>> {
    return this.real.listActivityLogs(ctx);
  }

  prepareTransactionDraft(
    request: {
      assetId: string;
      amount: string;
      sourceVaultId: string;
      destinationVaultId: string;
      note?: string;
    },
    ctx: FireblocksCallContext,
  ): ProvenanceRecord<TransactionDraft> {
    return this.real.prepareTransactionDraft(request, ctx);
  }
}
