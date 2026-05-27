import {
  FireblocksClientError,
  type FireblocksClient,
  type FireblocksCallContext,
} from "@taicc/fireblocks-client";
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
import { unavailableRecord, wrapList, availableRecord } from "./provenance.js";

/**
 * Real Fireblocks adapter — never invents data.
 * Returns "data unavailable" when API calls fail.
 */
export class FireblocksRealAdapter {
  constructor(private readonly client: FireblocksClient) {}

  async listVaultAccounts(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<VaultAccountRecord[]>> {
    try {
      const result = await this.client.listVaultAccounts(ctx);
      return wrapList(result.accounts, result.provenance);
    } catch (error) {
      return unavailableFromError(error, "GET /vault/accounts_paged");
    }
  }

  async getVaultAccount(
    id: string,
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<VaultAccountRecord>> {
    try {
      const result = await this.client.getVaultAccount(id, ctx);
      return availableRecord(result.account, result.provenance);
    } catch (error) {
      return unavailableFromError(error, `GET /vault/accounts/${id}`);
    }
  }

  async listExternalWallets(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<ExternalWalletRecord[]>> {
    try {
      const result = await this.client.listExternalWallets(ctx);
      return wrapList(result.wallets, result.provenance);
    } catch (error) {
      return unavailableFromError(error, "GET /external_wallets");
    }
  }

  async listTransactions(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<TransactionRecord[]>> {
    try {
      const result = await this.client.listTransactions(ctx);
      return wrapList(result.transactions, result.provenance);
    } catch (error) {
      return unavailableFromError(error, "GET /transactions");
    }
  }

  async getTransaction(
    id: string,
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<TransactionRecord>> {
    try {
      const result = await this.client.getTransaction(id, ctx);
      return availableRecord(result.transaction, result.provenance);
    } catch (error) {
      return unavailableFromError(error, `GET /transactions/${id}`);
    }
  }

  async getActivePolicy(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<FireblocksPolicyRuleRecord[]>> {
    try {
      const result = await this.client.getActivePolicy(ctx);
      return wrapList(result.rules, result.provenance);
    } catch (error) {
      return unavailableFromError(error, "GET /policy/active_policy");
    }
  }

  async listApprovals(
    _ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<ApprovalWorkflowRecord[]>> {
    // Fireblocks approval workflow data comes from pending transactions
    return unavailableRecord<ApprovalWorkflowRecord[]>(
      "REAL_FIREBLOCKS",
      "Approval workflow data unavailable — query pending transactions via GET /transactions",
      "GET /approvals",
    );
  }

  async listWebhookEvents(
    webhookId: string | undefined,
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<WebhookEventRecord[]>> {
    if (!webhookId) {
      return unavailableRecord<WebhookEventRecord[]>(
        "REAL_FIREBLOCKS",
        "Webhook ID required. Configure FIREBLOCKS_WEBHOOK_ID to fetch webhook events.",
        "GET /webhooks/{id}/notifications",
      );
    }
    try {
      const result = await this.client.listWebhookNotifications(webhookId, ctx);
      return wrapList(result.events, result.provenance);
    } catch (error) {
      return unavailableFromError(error, `GET /webhooks/${webhookId}/notifications`);
    }
  }

  async listCounterparties(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<CounterpartyRecord[]>> {
    try {
      const result = await this.client.listNetworkConnections(ctx);
      return wrapList(result.counterparties, result.provenance);
    } catch (error) {
      return unavailableFromError(error, "GET /network_connections");
    }
  }

  async listActivityLogs(
    ctx: FireblocksCallContext,
  ): Promise<ProvenanceRecord<ActivityLogRecord[]>> {
    try {
      const result = await this.client.listAuditLogs(ctx);
      return wrapList(result.logs, result.provenance);
    } catch (error) {
      return unavailableFromError(error, "GET /management/audit_logs");
    }
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
    const draft = this.client.prepareTransactionDraft(request, ctx);
    return availableRecord(draft, draft.provenance);
  }
}

function unavailableFromError<T>(
  error: unknown,
  endpoint: string,
): ProvenanceRecord<T> {
  const reason =
    error instanceof FireblocksClientError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Data unavailable";

  return unavailableRecord<T>("REAL_FIREBLOCKS", reason, endpoint);
}
