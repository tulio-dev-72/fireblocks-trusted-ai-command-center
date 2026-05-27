import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  Fireblocks,
  BasePath,
  TransferPeerPathType,
  PolicyType,
  GetAuditLogsTimePeriodEnum,
  type TransactionRequest,
  type VaultAccount,
} from "@fireblocks/ts-sdk";
import type { AuditLogger } from "@taicc/audit";
import type {
  VaultAccountRecord,
  VaultAssetRecord,
  TransactionRecord,
  ExternalWalletRecord,
  FireblocksPolicyRuleRecord,
  ActivityLogRecord,
  WebhookEventRecord,
  CounterpartyRecord,
  TransactionDraft,
  ProvenanceMetadata,
} from "@taicc/shared-types";

export interface FireblocksClientConfig {
  apiKey: string;
  secretKeyPath: string;
  basePath: string;
  workspaceId?: string;
}

export interface FireblocksCallContext {
  correlationId: string;
  actorId?: string;
}

export class FireblocksClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FireblocksClientError";
  }
}

function resolveBasePath(url: string): BasePath {
  if (url.includes("sandbox")) return BasePath.Sandbox;
  if (url.includes("eu2-api")) return BasePath.EU2;
  if (url.includes("eu-api")) return BasePath.EU;
  return BasePath.US;
}

function realProvenance(
  endpoint: string,
  correlationId: string,
  workspaceId?: string,
): ProvenanceMetadata {
  return {
    source_type: "REAL_FIREBLOCKS",
    fetched_at: new Date().toISOString(),
    api_endpoint: endpoint,
    workspace_id: workspaceId,
    mocked_fields: [],
    correlation_id: correlationId,
  };
}

/**
 * Official Fireblocks SDK adapter — read-only + draft preparation only.
 * Transaction execution is intentionally disabled (SR-6).
 */
export class FireblocksClient {
  private sdk: Fireblocks | null = null;
  private lastSuccessfulCallAt: string | undefined;

  constructor(
    private readonly config: FireblocksClientConfig,
    private readonly auditLogger: AuditLogger,
  ) {}

  getLastSuccessfulCallAt(): string | undefined {
    return this.lastSuccessfulCallAt;
  }

  private getSdk(): Fireblocks {
    if (this.sdk) return this.sdk;

    if (!this.config.apiKey?.trim()) {
      throw new FireblocksClientError(
        "NOT_CONFIGURED",
        "Fireblocks API key is not configured",
      );
    }

    let secretKey: string;
    try {
      secretKey = readFileSync(this.config.secretKeyPath, "utf-8");
    } catch {
      throw new FireblocksClientError(
        "SECRET_KEY_NOT_FOUND",
        `Fireblocks secret key not found at: ${this.config.secretKeyPath}`,
      );
    }

    this.sdk = new Fireblocks({
      apiKey: this.config.apiKey,
      secretKey,
      basePath: resolveBasePath(this.config.basePath),
    });

    return this.sdk;
  }

  async testConnection(ctx: FireblocksCallContext): Promise<boolean> {
    await this.listVaultAccounts(ctx, { limit: 1 });
    return true;
  }

  async listVaultAccounts(
    ctx: FireblocksCallContext,
    options?: { limit?: number; after?: string },
  ): Promise<{ accounts: VaultAccountRecord[]; provenance: ProvenanceMetadata }> {
    const endpoint = "GET /vault/accounts_paged";
    try {
      const sdk = this.getSdk();
      const response = await sdk.vaults.getPagedVaultAccounts({
        limit: options?.limit ?? 50,
        after: options?.after,
      });

      await this.auditSuccess(ctx, endpoint);
      const accounts = (response.data?.accounts ?? []).map((v) =>
        mapVaultAccount(v),
      );

      return {
        accounts,
        provenance: realProvenance(endpoint, ctx.correlationId, this.config.workspaceId),
      };
    } catch (error) {
      await this.auditFailure(ctx, endpoint, error);
      throw this.wrapError(error);
    }
  }

  async getVaultAccount(
    vaultAccountId: string,
    ctx: FireblocksCallContext,
  ): Promise<{ account: VaultAccountRecord; provenance: ProvenanceMetadata }> {
    const endpoint = `GET /vault/accounts/${vaultAccountId}`;
    try {
      const sdk = this.getSdk();
      const response = await sdk.vaults.getVaultAccount({ vaultAccountId });
      await this.auditSuccess(ctx, endpoint);

      return {
        account: mapVaultAccount(response.data),
        provenance: realProvenance(endpoint, ctx.correlationId, this.config.workspaceId),
      };
    } catch (error) {
      await this.auditFailure(ctx, endpoint, error);
      throw this.wrapError(error);
    }
  }

  async listExternalWallets(
    ctx: FireblocksCallContext,
  ): Promise<{ wallets: ExternalWalletRecord[]; provenance: ProvenanceMetadata }> {
    const endpoint = "GET /external_wallets";
    try {
      const sdk = this.getSdk();
      const response = await sdk.externalWallets.getExternalWallets();
      await this.auditSuccess(ctx, endpoint);

      const wallets = (response.data ?? []).map((w) => ({
        id: String(w.id ?? ""),
        name: w.name ?? "Unknown",
        customerRefId: w.customerRefId,
        assets: (w.assets ?? []).map((a) => mapAsset(a as unknown as Record<string, unknown>)),
      }));

      return {
        wallets,
        provenance: realProvenance(endpoint, ctx.correlationId, this.config.workspaceId),
      };
    } catch (error) {
      await this.auditFailure(ctx, endpoint, error);
      throw this.wrapError(error);
    }
  }

  async listTransactions(
    ctx: FireblocksCallContext,
    options?: { limit?: number; before?: string; after?: string },
  ): Promise<{ transactions: TransactionRecord[]; provenance: ProvenanceMetadata }> {
    const endpoint = "GET /transactions";
    try {
      const sdk = this.getSdk();
      const response = await sdk.transactions.getTransactions({
        limit: options?.limit ?? 50,
        before: options?.before,
        after: options?.after,
      });

      await this.auditSuccess(ctx, endpoint);
      const transactions = (response.data ?? []).map((t) =>
        mapTransaction(t as unknown as Record<string, unknown>),
      );

      return {
        transactions,
        provenance: realProvenance(endpoint, ctx.correlationId, this.config.workspaceId),
      };
    } catch (error) {
      await this.auditFailure(ctx, endpoint, error);
      throw this.wrapError(error);
    }
  }

  async getTransaction(
    txId: string,
    ctx: FireblocksCallContext,
  ): Promise<{ transaction: TransactionRecord; provenance: ProvenanceMetadata }> {
    const endpoint = `GET /transactions/${txId}`;
    try {
      const sdk = this.getSdk();
      const response = await sdk.transactions.getTransaction({ txId });
      await this.auditSuccess(ctx, endpoint);

      return {
        transaction: mapTransaction(response.data as unknown as Record<string, unknown>),
        provenance: realProvenance(endpoint, ctx.correlationId, this.config.workspaceId),
      };
    } catch (error) {
      await this.auditFailure(ctx, endpoint, error);
      throw this.wrapError(error);
    }
  }

  async getActivePolicy(
    ctx: FireblocksCallContext,
  ): Promise<{ rules: FireblocksPolicyRuleRecord[]; provenance: ProvenanceMetadata }> {
    const endpoint = "GET /policy/active_policy";
    try {
      const sdk = this.getSdk();
      const response = await sdk.policyEditorV2Beta.getActivePolicy({
        policyType: PolicyType.Transfer,
      });
      await this.auditSuccess(ctx, endpoint);

      const policyData = response.data as unknown as Record<string, unknown> | undefined;
      const rules: FireblocksPolicyRuleRecord[] = [];

      if (policyData?.policyRules && Array.isArray(policyData.policyRules)) {
        for (const rule of policyData.policyRules as Record<string, unknown>[]) {
          rules.push({
            id: String(rule.id ?? rule.ruleId ?? randomUUID()),
            name: String(rule.name ?? rule.description ?? "Policy rule"),
            type: String(rule.type ?? rule.policyEngineVersion ?? ""),
            action: String(rule.action ?? rule.verdict ?? ""),
            raw: rule,
          });
        }
      } else if (policyData) {
        rules.push({
          id: "active-policy",
          name: "Active Fireblocks Policy",
          raw: policyData,
        });
      }

      return {
        rules,
        provenance: realProvenance(endpoint, ctx.correlationId, this.config.workspaceId),
      };
    } catch (error) {
      await this.auditFailure(ctx, endpoint, error);
      throw this.wrapError(error);
    }
  }

  async listAuditLogs(
    ctx: FireblocksCallContext,
  ): Promise<{ logs: ActivityLogRecord[]; provenance: ProvenanceMetadata }> {
    const endpoint = "GET /management/audit_logs";
    try {
      const sdk = this.getSdk();
      const response = await sdk.auditLogs.getAuditLogs({
        timePeriod: GetAuditLogsTimePeriodEnum.Day,
      });
      await this.auditSuccess(ctx, endpoint);

      const raw = response.data as unknown;
      const entries = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { data?: unknown[] })?.data)
          ? (raw as { data: Record<string, unknown>[] }).data
          : [];

      const logs: ActivityLogRecord[] = entries.map((entry, i) => ({
        id: String(entry.id ?? entry.auditId ?? `log-${i}`),
        timestamp: String(entry.timestamp ?? entry.createdAt ?? new Date().toISOString()),
        user: entry.user ? String(entry.user) : entry.userId ? String(entry.userId) : undefined,
        action: entry.action ? String(entry.action) : entry.event ? String(entry.event) : undefined,
        subject: entry.subject ? String(entry.subject) : undefined,
        details: entry as Record<string, unknown>,
      }));

      return {
        logs,
        provenance: realProvenance(endpoint, ctx.correlationId, this.config.workspaceId),
      };
    } catch (error) {
      await this.auditFailure(ctx, endpoint, error);
      throw this.wrapError(error);
    }
  }

  async listWebhookNotifications(
    webhookId: string,
    ctx: FireblocksCallContext,
  ): Promise<{ events: WebhookEventRecord[]; provenance: ProvenanceMetadata }> {
    const endpoint = `GET /webhooks/${webhookId}/notifications`;
    try {
      const sdk = this.getSdk();
      const response = await sdk.webhooksV2.getNotifications({ webhookId });
      await this.auditSuccess(ctx, endpoint);

      const notificationsRaw = response.data as unknown;
      const notifications = Array.isArray(notificationsRaw)
        ? notificationsRaw
        : Array.isArray((notificationsRaw as { data?: unknown[] })?.data)
          ? (notificationsRaw as { data: Record<string, unknown>[] }).data
          : [];
      const events: WebhookEventRecord[] = notifications.map((n, i) => ({
        id: String(n.id ?? `wh-${i}`),
        type: n.eventType ? String(n.eventType) : undefined,
        status: n.status ? String(n.status) : undefined,
        createdAt: n.createdAt ? String(n.createdAt) : undefined,
        resourceId: n.resourceId ? String(n.resourceId) : undefined,
      }));

      return {
        events,
        provenance: realProvenance(endpoint, ctx.correlationId, this.config.workspaceId),
      };
    } catch (error) {
      await this.auditFailure(ctx, endpoint, error);
      throw this.wrapError(error);
    }
  }

  async listNetworkConnections(
    ctx: FireblocksCallContext,
  ): Promise<{ counterparties: CounterpartyRecord[]; provenance: ProvenanceMetadata }> {
    const endpoint = "GET /network_connections";
    try {
      const sdk = this.getSdk();
      const response = await sdk.networkConnections.getNetworkConnections();
      await this.auditSuccess(ctx, endpoint);

      const connectionsRaw = response.data as unknown;
      const connections = Array.isArray(connectionsRaw)
        ? connectionsRaw
        : Array.isArray((connectionsRaw as { connections?: unknown[] })?.connections)
          ? (connectionsRaw as { connections: Record<string, unknown>[] }).connections
          : connectionsRaw
            ? [connectionsRaw as Record<string, unknown>]
            : [];
      const counterparties: CounterpartyRecord[] = connections.map((c, i) => ({
        id: String(c.id ?? c.connectionId ?? `conn-${i}`),
        name: c.name ? String(c.name) : c.counterpartyName ? String(c.counterpartyName) : undefined,
        type: c.type ? String(c.type) : "network_connection",
        status: c.status ? String(c.status) : undefined,
      }));

      return {
        counterparties,
        provenance: realProvenance(endpoint, ctx.correlationId, this.config.workspaceId),
      };
    } catch (error) {
      await this.auditFailure(ctx, endpoint, error);
      throw this.wrapError(error);
    }
  }

  /** Prepare a transaction draft locally — does NOT submit to Fireblocks. */
  prepareTransactionDraft(
    request: {
      assetId: string;
      amount: string;
      sourceVaultId: string;
      destinationVaultId: string;
      note?: string;
    },
    ctx: FireblocksCallContext,
  ): TransactionDraft {
    const payload: TransactionRequest = {
      assetId: request.assetId,
      amount: request.amount,
      source: {
        type: TransferPeerPathType.VaultAccount,
        id: request.sourceVaultId,
      },
      destination: {
        type: TransferPeerPathType.VaultAccount,
        id: request.destinationVaultId,
      },
      note: request.note ?? "Draft prepared by Trusted AI Command Center (not submitted)",
    };

    return {
      draftId: randomUUID(),
      assetId: request.assetId,
      amount: request.amount,
      source: { type: "VAULT_ACCOUNT", id: request.sourceVaultId },
      destination: { type: "VAULT_ACCOUNT", id: request.destinationVaultId },
      note: payload.note,
      status: "draft",
      execution_disabled: true,
      prepared_at: new Date().toISOString(),
      provenance: {
        source_type: "DERIVED_AI",
        fetched_at: new Date().toISOString(),
        api_endpoint: "LOCAL /transactions/draft",
        workspace_id: this.config.workspaceId,
        mocked_fields: [],
        correlation_id: ctx.correlationId,
      },
    };
  }

  private async auditSuccess(ctx: FireblocksCallContext, action: string): Promise<void> {
    this.lastSuccessfulCallAt = new Date().toISOString();
    await this.auditLogger.record({
      correlationId: ctx.correlationId,
      eventType: "fireblocks_api_call",
      actorId: ctx.actorId,
      action,
      outcome: "success",
      metadata: { readOnly: true },
    });
  }

  private async auditFailure(ctx: FireblocksCallContext, action: string, error: unknown): Promise<void> {
    await this.auditLogger.record({
      correlationId: ctx.correlationId,
      eventType: "fireblocks_api_call",
      actorId: ctx.actorId,
      action,
      outcome: "failure",
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }

  private wrapError(error: unknown): FireblocksClientError {
    if (error instanceof FireblocksClientError) return error;
    if (error instanceof Error) {
      return new FireblocksClientError("API_ERROR", error.message);
    }
    if (typeof error === "object" && error !== null) {
      const record = error as Record<string, unknown>;
      const message =
        typeof record.message === "string"
          ? record.message
          : JSON.stringify(error);
      return new FireblocksClientError("API_ERROR", message);
    }
    return new FireblocksClientError("API_ERROR", String(error));
  }
}

function mapVaultAccount(v: VaultAccount): VaultAccountRecord {
  return {
    id: String(v.id ?? ""),
    name: v.name ?? "Unknown",
    hiddenOnUI: v.hiddenOnUI,
    autoFuel: v.autoFuel,
    assets: (v.assets ?? []).map((a) => mapAsset(a as unknown as Record<string, unknown>)),
  };
}

function mapAsset(a: Record<string, unknown>): VaultAssetRecord {
  return {
    id: String(a.id ?? ""),
    total: a.total != null ? String(a.total) : undefined,
    available: a.available != null ? String(a.available) : undefined,
    balance: a.balance != null ? String(a.balance) : undefined,
    lockedAmount: a.lockedAmount != null ? String(a.lockedAmount) : undefined,
  };
}

function mapTransaction(t: Record<string, unknown>): TransactionRecord {
  return {
    id: String(t.id ?? ""),
    status: String(t.status ?? "UNKNOWN"),
    assetId: t.assetId ? String(t.assetId) : undefined,
    amount: typeof t.amount === "number" ? t.amount : undefined,
    amountUSD: typeof t.amountUSD === "number" ? t.amountUSD : undefined,
    source: t.source as Record<string, unknown> | undefined,
    destination: t.destination as Record<string, unknown> | undefined,
    createdAt: typeof t.createdAt === "number" ? t.createdAt : undefined,
    lastUpdated: typeof t.lastUpdated === "number" ? t.lastUpdated : undefined,
    note: t.note ? String(t.note) : undefined,
    txHash: t.txHash ? String(t.txHash) : undefined,
  };
}

export function createFireblocksClient(
  config: FireblocksClientConfig,
  auditLogger: AuditLogger,
): FireblocksClient {
  return new FireblocksClient(config, auditLogger);
}

export {
  createConnectionVerificationService,
  FireblocksConnectionVerificationService,
  SANDBOX_BASE,
} from "./connection-verification.js";
export type { ConnectionVerificationConfig } from "./connection-verification.js";

export type { TransactionRequest };
