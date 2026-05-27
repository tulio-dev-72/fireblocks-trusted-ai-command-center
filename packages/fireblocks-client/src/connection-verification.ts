import { existsSync } from "node:fs";
import { createSign, createPrivateKey } from "node:crypto";
import type {
  CredentialCheck,
  EndpointProbe,
  FireblocksConnectionStatus,
  FireblocksHealth,
  DataMode,
} from "@taicc/shared-types";
import type { FireblocksClient } from "./index.js";
import type { FireblocksCallContext } from "./index.js";
import { isFireblocksPrivateKeyConfigured, resolveFireblocksPrivateKey } from "./secret-key.js";

export interface ConnectionVerificationConfig {
  apiKey: string;
  secretKeyPath: string;
  secretKeyInline?: string;
  basePath: string;
  workspaceId?: string;
  dataMode: DataMode;
  realFireblocks: boolean;
  demoMode: boolean;
  hybridMode: boolean;
}

const SANDBOX_BASE = "https://sandbox-api.fireblocks.io/v1";

function formatProbeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

const PROBE_ENDPOINTS = [
  { name: "vault_accounts", call: (c: FireblocksClient, ctx: FireblocksCallContext) => c.listVaultAccounts(ctx, { limit: 1 }) },
  { name: "transactions", call: (c: FireblocksClient, ctx: FireblocksCallContext) => c.listTransactions(ctx, { limit: 5 }) },
  { name: "external_wallets", call: (c: FireblocksClient, ctx: FireblocksCallContext) => c.listExternalWallets(ctx) },
  { name: "policy", call: (c: FireblocksClient, ctx: FireblocksCallContext) => c.getActivePolicy(ctx) },
  { name: "audit_logs", call: (c: FireblocksClient, ctx: FireblocksCallContext) => c.listAuditLogs(ctx) },
  { name: "network_connections", call: (c: FireblocksClient, ctx: FireblocksCallContext) => c.listNetworkConnections(ctx) },
] as const;

export class FireblocksConnectionVerificationService {
  constructor(
    private readonly config: ConnectionVerificationConfig,
    private readonly client: FireblocksClient,
  ) {}

  isSandboxMode(): boolean {
    return this.config.basePath.includes("sandbox-api.fireblocks.io");
  }

  getLastSuccessfulCallAt(): string | undefined {
    return this.client.getLastSuccessfulCallAt();
  }

  /** Validate credentials locally — no network call. */
  validateCredentials(): CredentialCheck[] {
    const checks: CredentialCheck[] = [];

    const apiKey = this.config.apiKey?.trim() ?? "";
    if (!apiKey) {
      checks.push({
        check: "api_key",
        valid: false,
        message: "FIREBLOCKS_API_KEY is missing or empty",
      });
    } else if (apiKey.length < 8) {
      checks.push({
        check: "api_key",
        valid: false,
        message: "FIREBLOCKS_API_KEY appears invalid (too short)",
      });
    } else {
      checks.push({
        check: "api_key",
        valid: true,
        message: `API key configured (${apiKey.slice(0, 4)}…${apiKey.slice(-4)})`,
      });
    }

    const inlineKey = this.config.secretKeyInline?.trim();
    const keyPath = this.config.secretKeyPath;

    if (inlineKey) {
      checks.push({
        check: "secret_key_env",
        valid: true,
        message: "FIREBLOCKS_PRIVATE_KEY configured (inline secret — not from file)",
      });
    } else if (!keyPath?.trim()) {
      checks.push({
        check: "secret_key_path",
        valid: false,
        message: "Set FIREBLOCKS_PRIVATE_KEY or FIREBLOCKS_SECRET_KEY_PATH",
      });
    } else if (!existsSync(keyPath)) {
      checks.push({
        check: "secret_key_path",
        valid: false,
        message: `Private key file not found at: ${keyPath}`,
      });
    } else {
      checks.push({
        check: "secret_key_path",
        valid: true,
        message: `Private key file found at: ${keyPath}`,
      });
    }

    checks.push(this.validateJwtSigning());

    const basePath = this.config.basePath?.trim() ?? "";
    if (!basePath) {
      checks.push({
        check: "base_path",
        valid: false,
        message: "FIREBLOCKS_BASE_PATH is not set",
      });
    } else if (!basePath.startsWith("https://")) {
      checks.push({
        check: "base_path",
        valid: false,
        message: "FIREBLOCKS_BASE_PATH must be an HTTPS URL",
      });
    } else {
      checks.push({
        check: "base_path",
        valid: true,
        message: this.isSandboxMode()
          ? `Sandbox endpoint: ${basePath}`
          : `Production endpoint: ${basePath}`,
      });
    }

    return checks;
  }

  private validateJwtSigning(): CredentialCheck {
    try {
      if (
        !isFireblocksPrivateKeyConfigured({
          secretKeyPath: this.config.secretKeyPath,
          secretKeyInline: this.config.secretKeyInline,
        })
      ) {
        return {
          check: "jwt_signing",
          valid: false,
          message: "Cannot validate JWT signing — private key not configured",
        };
      }

      const pem = resolveFireblocksPrivateKey({
        secretKeyPath: this.config.secretKeyPath,
        secretKeyInline: this.config.secretKeyInline,
      });
      if (!pem.includes("BEGIN") || !pem.includes("PRIVATE KEY")) {
        return {
          check: "jwt_signing",
          valid: false,
          message: "Private key is not a valid PEM-encoded key",
        };
      }

      const keyObject = createPrivateKey(pem);
      const sign = createSign("RSA-SHA256");
      sign.update("fireblocks-connection-test");
      sign.end();
      sign.sign(keyObject);

      return {
        check: "jwt_signing",
        valid: true,
        message: "Private key supports RSA-SHA256 JWT signing (Fireblocks SDK format)",
      };
    } catch (error) {
      return {
        check: "jwt_signing",
        valid: false,
        message: `JWT signing validation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /** Fail loudly when credential checks fail in real mode. */
  assertCredentialsValid(): void {
    if (this.config.demoMode) return;

    const checks = this.validateCredentials();
    const failures = checks.filter((c) => !c.valid);
    if (failures.length === 0) return;

    const details = failures.map((f) => `  - ${f.check}: ${f.message}`).join("\n");
    throw new Error(
      `Fireblocks credential validation failed — refusing to start in real mode.\n${details}\n` +
        "Fix FIREBLOCKS_API_KEY, FIREBLOCKS_PRIVATE_KEY (or FIREBLOCKS_SECRET_KEY_PATH), and FIREBLOCKS_BASE_PATH. " +
        "Never silently falling back to demo data.",
    );
  }

  async verifyConnection(
    ctx: FireblocksCallContext,
  ): Promise<FireblocksConnectionStatus> {
    const now = new Date().toISOString();
    const credentialChecks = this.validateCredentials();
    const credsValid = credentialChecks.every((c) => c.valid);

    const status: FireblocksConnectionStatus = {
      connected: false,
      mode: this.config.dataMode,
      real_fireblocks_enabled: this.config.realFireblocks,
      demo_mode: this.config.demoMode,
      hybrid_mode: this.config.hybridMode,
      sandbox_mode: this.isSandboxMode(),
      credentials_present:
        Boolean(this.config.apiKey?.trim()) &&
        isFireblocksPrivateKeyConfigured({
          secretKeyPath: this.config.secretKeyPath,
          secretKeyInline: this.config.secretKeyInline,
        }),
      secret_key_present: isFireblocksPrivateKeyConfigured({
        secretKeyPath: this.config.secretKeyPath,
        secretKeyInline: this.config.secretKeyInline,
      }),
      base_path: this.config.basePath,
      workspace_id: this.config.workspaceId,
      last_checked_at: now,
      credential_checks: credentialChecks,
      reachable_endpoints: [],
      unreachable_endpoints: [],
      endpoint_probes: [],
    };

    if (this.config.demoMode) {
      status.connected = true;
      status.reachable_endpoints = ["DEMO_SEED"];
      status.error = "Demo mode active — not connected to Fireblocks sandbox";
      return status;
    }

    if (!credsValid) {
      const failures = credentialChecks.filter((c) => !c.valid);
      status.error = failures.map((f) => `${f.check}: ${f.message}`).join("; ");
      status.unreachable_endpoints = ["ALL"];
      return status;
    }

    const probes: EndpointProbe[] = [];
    let minLatency = Infinity;

    for (const ep of PROBE_ENDPOINTS) {
      const start = Date.now();
      try {
        await ep.call(this.client, ctx);
        const latency = Date.now() - start;
        minLatency = Math.min(minLatency, latency);
        probes.push({
          name: ep.name,
          available: true,
          latency_ms: latency,
          source_type: "REAL_FIREBLOCKS",
        });
        status.reachable_endpoints.push(ep.name);
      } catch (error) {
        probes.push({
          name: ep.name,
          available: false,
          latency_ms: Date.now() - start,
          error: formatProbeError(error),
          source_type: "REAL_FIREBLOCKS",
        });
        status.unreachable_endpoints.push(ep.name);
      }
    }

    status.endpoint_probes = probes;
    status.api_latency_ms = minLatency === Infinity ? undefined : minLatency;
    status.connected = status.reachable_endpoints.length > 0;
    status.last_successful_call_at = this.client.getLastSuccessfulCallAt();
    status.authenticated_workspace =
      this.config.workspaceId ??
      (status.connected ? "Fireblocks sandbox workspace (authenticated)" : undefined);

    if (!status.connected) {
      status.error =
        "Unable to reach any Fireblocks sandbox endpoints. " +
        "Verify API key permissions and private key pairing in the Fireblocks sandbox console.";
    }

    return status;
  }

  async getHealth(ctx: FireblocksCallContext): Promise<FireblocksHealth> {
    if (this.config.demoMode) {
      return {
        status: "degraded",
        connected: false,
        sandbox_mode: false,
        data_mode: "demo",
        credential_checks: this.validateCredentials(),
        message: "Running in DEMO_MODE — Fireblocks sandbox not in use",
      };
    }

    const credentialChecks = this.validateCredentials();
    const credsValid = credentialChecks.every((c) => c.valid);

    if (!credsValid) {
      const failures = credentialChecks.filter((c) => !c.valid);
      return {
        status: "failed",
        connected: false,
        sandbox_mode: this.isSandboxMode(),
        data_mode: this.config.dataMode,
        credential_checks: credentialChecks,
        error: failures.map((f) => `${f.check}: ${f.message}`).join("; "),
        message: "Fireblocks credential validation failed",
      };
    }

    const start = Date.now();
    try {
      await this.client.listVaultAccounts(ctx, { limit: 1 });
      const latency = Date.now() - start;
      return {
        status: "ok",
        connected: true,
        sandbox_mode: this.isSandboxMode(),
        data_mode: this.config.dataMode,
        credential_checks: credentialChecks,
        api_latency_ms: latency,
        message: this.isSandboxMode()
          ? "Connected to Fireblocks sandbox"
          : "Connected to Fireblocks production",
      };
    } catch (error) {
      return {
        status: "failed",
        connected: false,
        sandbox_mode: this.isSandboxMode(),
        data_mode: this.config.dataMode,
        credential_checks: credentialChecks,
        api_latency_ms: Date.now() - start,
        error: formatProbeError(error),
        message: "Fireblocks API connection failed",
      };
    }
  }
}

export function createConnectionVerificationService(
  config: ConnectionVerificationConfig,
  client: FireblocksClient,
): FireblocksConnectionVerificationService {
  return new FireblocksConnectionVerificationService(config, client);
}

export { SANDBOX_BASE };
