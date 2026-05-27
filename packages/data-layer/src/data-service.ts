import type { EnvConfig } from "@taicc/config";
import {
  resolveDataMode,
} from "@taicc/config";
import {
  createConnectionVerificationService,
  type FireblocksClient,
  type FireblocksCallContext,
} from "@taicc/fireblocks-client";
import type {
  DataMode,
  FireblocksConnectionStatus,
  ProvenanceRecord,
  TransactionDraft,
  EvidenceItem,
} from "@taicc/shared-types";
import { DemoSeedAdapter } from "./demo-seed.js";
import { FireblocksRealAdapterExtended } from "./fireblocks-real-extended.js";
import { HybridAdapter } from "./hybrid-adapter.js";

export class DataService {
  private readonly mode: DataMode;
  private readonly demo: DemoSeedAdapter;
  private readonly real: FireblocksRealAdapterExtended;
  private readonly hybrid: HybridAdapter;
  private lastConnectionCheck: FireblocksConnectionStatus | null = null;
  private readonly connectionVerification;

  constructor(
    config: EnvConfig,
    fireblocksClient: FireblocksClient,
  ) {
    this.mode = resolveDataMode(config);
    this.demo = new DemoSeedAdapter();
    this.real = new FireblocksRealAdapterExtended(fireblocksClient);
    this.hybrid = new HybridAdapter(this.real);
    this.connectionVerification = createConnectionVerificationService(
      {
        apiKey: config.FIREBLOCKS_API_KEY ?? "",
        secretKeyPath: config.FIREBLOCKS_SECRET_KEY_PATH,
        basePath: config.FIREBLOCKS_BASE_PATH,
        workspaceId: config.FIREBLOCKS_WORKSPACE_ID,
        dataMode: this.mode,
        realFireblocks: config.REAL_FIREBLOCKS,
        demoMode: config.DEMO_MODE,
        hybridMode: config.HYBRID_MODE,
      },
      fireblocksClient,
    );
  }

  getConnectionVerification() {
    return this.connectionVerification;
  }

  getMode(): DataMode {
    return this.mode;
  }

  /** Startup gate — fails loudly in real mode with invalid credentials. */
  assertReady(): void {
    this.connectionVerification.assertCredentialsValid();
  }

  filterForAi<T>(record: ProvenanceRecord<T>): ProvenanceRecord<T> {
    if (this.mode === "demo") {
      return {
        data: null,
        available: false,
        unavailable_reason:
          "AI queries disabled in demo mode. Set REAL_FIREBLOCKS=true with sandbox credentials.",
        provenance: record.provenance,
      };
    }
    if (
      this.mode === "real" &&
      record.provenance.source_type !== "REAL_FIREBLOCKS"
    ) {
      return {
        data: null,
        available: false,
        unavailable_reason: "Only REAL_FIREBLOCKS data permitted for AI answers",
        provenance: record.provenance,
      };
    }
    return record;
  }

  toEvidence<T>(label: string, record: ProvenanceRecord<T>, id: string): EvidenceItem {
    return {
      id,
      label,
      value: record.available ? record.data : record.unavailable_reason ?? "Data unavailable",
      provenance: record.provenance,
      available: record.available,
    };
  }

  async checkConnection(ctx: FireblocksCallContext): Promise<FireblocksConnectionStatus> {
    const status = await this.connectionVerification.verifyConnection(ctx);
    this.lastConnectionCheck = status;
    return status;
  }

  getLastConnectionCheck(): FireblocksConnectionStatus | null {
    return this.lastConnectionCheck;
  }

  listVaultAccounts(ctx: FireblocksCallContext) {
    return this.route(
      () => this.demo.listVaultAccounts(),
      () => this.real.listVaultAccounts(ctx),
      () => this.hybrid.listVaultAccounts(ctx),
    );
  }

  getVaultAccount(id: string, ctx: FireblocksCallContext) {
    return this.route(
      () => this.demo.getVaultAccount(id),
      () => this.real.getVaultAccount(id, ctx),
      () => this.hybrid.getVaultAccount(id, ctx),
    );
  }

  listExternalWallets(ctx: FireblocksCallContext) {
    return this.route(
      () => this.demo.listExternalWallets(),
      () => this.real.listExternalWallets(ctx),
      () => this.hybrid.listExternalWallets(ctx),
    );
  }

  listBalances(ctx: FireblocksCallContext) {
    return this.route(
      () => this.demo.listBalances(),
      () => this.real.listBalances(ctx),
      () => this.real.listBalances(ctx),
    );
  }

  listTransactions(ctx: FireblocksCallContext) {
    return this.route(
      () => this.demo.listTransactions(),
      () => this.real.listTransactions(ctx),
      () => this.hybrid.listTransactions(ctx),
    );
  }

  getTransaction(id: string, ctx: FireblocksCallContext) {
    return this.route(
      () => this.demo.getTransaction(id),
      () => this.real.getTransaction(id, ctx),
      () => this.hybrid.getTransaction(id, ctx),
    );
  }

  getActivePolicy(ctx: FireblocksCallContext) {
    return this.route(
      () => this.demo.getActivePolicy(),
      () => this.real.getActivePolicy(ctx),
      () => this.hybrid.getActivePolicy(ctx),
    );
  }

  listApprovals(ctx: FireblocksCallContext) {
    return this.route(
      () => this.demo.listApprovals(),
      () => this.real.listApprovals(ctx),
      () => this.real.listApprovals(ctx),
    );
  }

  listWebhookEvents(webhookId: string | undefined, ctx: FireblocksCallContext) {
    return this.route(
      () => this.demo.listWebhookEvents(),
      () => this.real.listWebhookEvents(webhookId, ctx),
      () => this.hybrid.listWebhookEvents(webhookId, ctx),
    );
  }

  listCounterparties(ctx: FireblocksCallContext) {
    return this.route(
      () => this.demo.listCounterparties(),
      () => this.real.listCounterparties(ctx),
      () => this.hybrid.listCounterparties(ctx),
    );
  }

  listActivityLogs(ctx: FireblocksCallContext) {
    return this.route(
      () => this.demo.listActivityLogs(),
      () => this.real.listActivityLogs(ctx),
      () => this.hybrid.listActivityLogs(ctx),
    );
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
    if (this.mode === "demo") {
      return this.demo.prepareTransactionDraft();
    }
    return this.real.prepareTransactionDraft(request, ctx);
  }

  private route<T>(
    demoFn: () => ProvenanceRecord<T> | Promise<ProvenanceRecord<T>>,
    realFn: () => ProvenanceRecord<T> | Promise<ProvenanceRecord<T>>,
    hybridFn: () => ProvenanceRecord<T> | Promise<ProvenanceRecord<T>>,
  ): ProvenanceRecord<T> | Promise<ProvenanceRecord<T>> {
    switch (this.mode) {
      case "demo":
        return demoFn();
      case "hybrid":
        return hybridFn();
      case "real":
      default:
        return realFn();
    }
  }
}

export function createDataService(
  config: EnvConfig,
  fireblocksClient: FireblocksClient,
): DataService {
  return new DataService(config, fireblocksClient);
}

export * from "./provenance.js";
export * from "./demo-seed.js";
export * from "./fireblocks-real-adapter.js";
export * from "./fireblocks-real-extended.js";
export * from "./hybrid-adapter.js";
export * from "./treasury-analyzer.js";
