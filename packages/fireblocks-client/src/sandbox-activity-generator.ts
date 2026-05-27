import type { AuditLogger } from "@taicc/audit";
import type {
  ProvenanceMetadata,
  SandboxActivityRequest,
  SandboxActivityResult,
  SandboxActivityStep,
} from "@taicc/shared-types";
import type { FireblocksClient, FireblocksClientConfig, FireblocksCallContext } from "./index.js";

export class SandboxActivityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SandboxActivityError";
  }
}

export function assertSandboxBasePath(basePath: string): void {
  const normalized = basePath.trim().toLowerCase();
  if (!normalized.includes("sandbox-api.fireblocks.io")) {
    throw new SandboxActivityError(
      "SANDBOX_ONLY",
      "Sandbox activity generation is forbidden outside Fireblocks sandbox. " +
        `FIREBLOCKS_BASE_PATH must use sandbox-api.fireblocks.io (got: ${basePath}).`,
    );
  }
}

function sandboxProvenance(
  endpoint: string,
  correlationId: string,
  workspaceId?: string,
): ProvenanceMetadata {
  return {
    source_type: "REAL_FIREBLOCKS_SANDBOX",
    fetched_at: new Date().toISOString(),
    api_endpoint: endpoint,
    workspace_id: workspaceId,
    mocked_fields: [],
    correlation_id: correlationId,
  };
}

export interface SandboxActivityGeneratorDeps {
  client: FireblocksClient;
  config: FireblocksClientConfig;
  auditLogger: AuditLogger;
}

export class SandboxActivityGenerator {
  constructor(private readonly deps: SandboxActivityGeneratorDeps) {}

  async run(
    request: SandboxActivityRequest,
    ctx: FireblocksCallContext,
    actorId: string,
  ): Promise<SandboxActivityResult> {
    assertSandboxBasePath(this.deps.config.basePath);

    const steps: SandboxActivityStep[] = [];
    const errors: string[] = [];
    const correlationId = ctx.correlationId;

    if (request.create_vault) {
      const vaultName =
        request.vault_name?.trim() ??
        `TAICC Sandbox Activity ${new Date().toISOString().slice(0, 19)}`;
      try {
        const created = await this.deps.client.createSandboxVaultAccount(
          vaultName,
          ctx,
        );
        steps.push({
          action: "create_vault",
          ok: true,
          detail: `Created vault account: ${created.name}`,
          resource_id: created.id,
        });
        await this.auditStep({
          correlationId,
          actorId,
          action: "POST /vault/accounts",
          outcome: "success",
          metadata: {
            vault_id: created.id,
            vault_name: created.name,
            source_type: "REAL_FIREBLOCKS_SANDBOX",
          },
        });
      } catch (error) {
        const message = formatError(error);
        errors.push(message);
        steps.push({
          action: "create_vault",
          ok: false,
          detail: message,
        });
        await this.auditStep({
          correlationId,
          actorId,
          action: "POST /vault/accounts",
          outcome: "failure",
          metadata: { error: message, source_type: "REAL_FIREBLOCKS_SANDBOX" },
        });
      }
    }

    if (request.transfer) {
      const { source_vault_id, destination_vault_id, asset_id, amount, note } =
        request.transfer;

      if (source_vault_id === destination_vault_id) {
        const message = "Source and destination vault must differ for sandbox transfers";
        errors.push(message);
        steps.push({
          action: "vault_to_vault_transfer",
          ok: false,
          detail: message,
        });
      } else {
        try {
          const tx = await this.deps.client.createSandboxVaultTransfer(
            {
              sourceVaultId: source_vault_id,
              destinationVaultId: destination_vault_id,
              assetId: asset_id,
              amount,
              note:
                note ??
                "TAICC human-initiated sandbox vault-to-vault test transfer (not AI)",
            },
            ctx,
          );
          steps.push({
            action: "vault_to_vault_transfer",
            ok: true,
            detail: `Submitted vault-to-vault transfer (${asset_id} ${amount})`,
            fireblocks_tx_id: tx.id,
            resource_id: tx.id,
          });
          await this.auditStep({
            correlationId,
            actorId,
            action: "POST /transactions",
            outcome: "success",
            metadata: {
              fireblocks_tx_id: tx.id,
              status: tx.status,
              asset_id,
              amount,
              source_vault_id,
              destination_vault_id,
              source_type: "REAL_FIREBLOCKS_SANDBOX",
            },
          });
        } catch (error) {
          const message = formatError(error);
          errors.push(message);
          steps.push({
            action: "vault_to_vault_transfer",
            ok: false,
            detail: message,
          });
          await this.auditStep({
            correlationId,
            actorId,
            action: "POST /transactions",
            outcome: "failure",
            metadata: {
              error: message,
              source_type: "REAL_FIREBLOCKS_SANDBOX",
              ...request.transfer,
            },
          });
        }
      }
    }

    let vaultCount: number | undefined;
    let walletCount: number | undefined;
    let balanceLineCount: number | undefined;

    if (request.include_snapshot !== false) {
      try {
        const vaults = await this.deps.client.listVaultAccounts(ctx, { limit: 50 });
        vaultCount = vaults.accounts.length;
        steps.push({
          action: "list_vaults",
          ok: true,
          detail: `${vaultCount} vault account(s) retrieved`,
        });
        await this.auditStep({
          correlationId,
          actorId,
          action: "GET /vault/accounts_paged",
          outcome: "success",
          metadata: { count: vaultCount, source_type: "REAL_FIREBLOCKS_SANDBOX" },
        });

        balanceLineCount = vaults.accounts.reduce(
          (sum, v) => sum + (v.assets?.length ?? 0),
          0,
        );
        steps.push({
          action: "list_balances",
          ok: true,
          detail: `${balanceLineCount} balance line(s) across vaults`,
        });
      } catch (error) {
        const message = formatError(error);
        errors.push(message);
        steps.push({ action: "list_vaults", ok: false, detail: message });
      }

      try {
        const wallets = await this.deps.client.listExternalWallets(ctx);
        walletCount = wallets.wallets.length;
        steps.push({
          action: "list_wallets",
          ok: true,
          detail: `${walletCount} external wallet(s) retrieved`,
        });
        await this.auditStep({
          correlationId,
          actorId,
          action: "GET /external_wallets",
          outcome: "success",
          metadata: { count: walletCount, source_type: "REAL_FIREBLOCKS_SANDBOX" },
        });
      } catch (error) {
        const message = formatError(error);
        errors.push(message);
        steps.push({ action: "list_wallets", ok: false, detail: message });
      }
    }

    const ok = steps.some((s) => s.ok) && errors.length === 0;
    const message = ok
      ? "Sandbox activity completed — all actions recorded as REAL_FIREBLOCKS_SANDBOX"
      : errors[0] ??
        "Sandbox activity completed with errors — review steps and audit log";

    return {
      ok,
      sandbox_only: true,
      source_type: "REAL_FIREBLOCKS_SANDBOX",
      provenance: sandboxProvenance(
        "POST /v1/sandbox/activity/generate",
        correlationId,
        this.deps.config.workspaceId,
      ),
      steps,
      vault_count: vaultCount,
      external_wallet_count: walletCount,
      balance_line_count: balanceLineCount,
      errors,
      message,
    };
  }

  /** Default seed preset for CLI — creates vault + optional transfer between existing vaults */
  async runDefaultSeed(
    ctx: FireblocksCallContext,
    actorId: string,
    options?: {
      createVault?: boolean;
      transfer?: boolean;
      assetId?: string;
      amount?: string;
    },
  ): Promise<SandboxActivityResult> {
    assertSandboxBasePath(this.deps.config.basePath);

    const vaults = await this.deps.client.listVaultAccounts(ctx, { limit: 50 });
    const accounts = vaults.accounts;

    const request: SandboxActivityRequest = {
      human_confirmed: true,
      create_vault: options?.createVault ?? true,
      include_snapshot: true,
    };

    if (options?.transfer !== false && accounts.length >= 2) {
      const source = accounts[0]!;
      const destination = accounts[1]!;
      const assetId =
        options?.assetId ??
        source.assets?.find((a) => parseFloat(a.available ?? "0") > 0)?.id ??
        source.assets?.[0]?.id ??
        "ETH_TEST5";

      request.transfer = {
        source_vault_id: source.id,
        destination_vault_id: destination.id,
        asset_id: assetId,
        amount: options?.amount ?? "0.001",
        note: "TAICC fireblocks:seed-sandbox CLI — human-initiated test transfer",
      };
    }

    return this.run(request, ctx, actorId);
  }

  private async auditStep(input: {
    correlationId: string;
    actorId: string;
    action: string;
    outcome: "success" | "failure";
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.deps.auditLogger.record({
      correlationId: input.correlationId,
      eventType: "sandbox_activity",
      actorId: input.actorId,
      action: input.action,
      outcome: input.outcome,
      metadata: {
        ...input.metadata,
        initiated_by: "human",
        ai_execution: false,
      },
    });
  }
}

export function createSandboxActivityGenerator(
  deps: SandboxActivityGeneratorDeps,
): SandboxActivityGenerator {
  return new SandboxActivityGenerator(deps);
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export { sandboxProvenance };
