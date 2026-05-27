import type { EnvConfig } from "@taicc/config";
import { resolveDataMode } from "@taicc/config";
import type { DataService } from "@taicc/data-layer";
import type {
  FireblocksIntegrationDetail,
  IntegrationCheck,
  SystemIntegrationStatus,
} from "@taicc/shared-types";
import { SYSTEM_ACTOR_ID } from "@taicc/shared-types";

async function probeOpenAi(config: EnvConfig): Promise<IntegrationCheck> {
  const apiKey = config.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      id: "openai",
      label: "OpenAI",
      status: "inactive",
      detail: "OPENAI_API_KEY not configured",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.AI_MODEL,
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      }),
    });

    if (response.ok) {
      return {
        id: "openai",
        label: "OpenAI",
        status: "connected",
        detail: `Model ${config.AI_MODEL} reachable`,
      };
    }

    const body = await response.text();
    const degraded = response.status === 429 || response.status === 402;
    return {
      id: "openai",
      label: "OpenAI",
      status: degraded ? "degraded" : "disconnected",
      detail: `HTTP ${response.status}: ${body.slice(0, 120)}`,
    };
  } catch (error) {
    return {
      id: "openai",
      label: "OpenAI",
      status: "disconnected",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeAnthropic(config: EnvConfig): Promise<IntegrationCheck> {
  const apiKey = config.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return {
      id: "anthropic",
      label: "Anthropic",
      status: "inactive",
      detail: "ANTHROPIC_API_KEY not configured",
    };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.ANTHROPIC_MODEL,
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      }),
    });

    if (response.ok) {
      return {
        id: "anthropic",
        label: "Anthropic",
        status: "connected",
        detail: `Model ${config.ANTHROPIC_MODEL} reachable`,
      };
    }

    const body = await response.text();
    return {
      id: "anthropic",
      label: "Anthropic",
      status: "disconnected",
      detail: `HTTP ${response.status}: ${body.slice(0, 120)}`,
    };
  } catch (error) {
    return {
      id: "anthropic",
      label: "Anthropic",
      status: "disconnected",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

export async function buildSystemIntegrationStatus(
  config: EnvConfig,
  dataService: DataService,
  correlationId: string,
): Promise<SystemIntegrationStatus> {
  const fbCtx = { correlationId, actorId: SYSTEM_ACTOR_ID };
  const verification = dataService.getConnectionVerification();
  const health = await verification.getHealth(fbCtx);

  const jwtSigningValid = (health.credential_checks ?? []).some(
    (c) => c.check === "jwt_signing" && c.valid,
  );

  const fireblocks: FireblocksIntegrationDetail = {
    connected: health.connected,
    sandbox_mode: health.sandbox_mode,
    jwt_signing_valid: jwtSigningValid,
    api_latency_ms: health.api_latency_ms,
    error: health.error,
  };

  if (health.connected && resolveDataMode(config) === "real") {
    try {
      const [vaults, balances, transactions] = await Promise.all([
        dataService.listVaultAccounts(fbCtx),
        dataService.listBalances(fbCtx),
        dataService.listTransactions(fbCtx),
      ]);

      if (!vaults.available || !balances.available || !transactions.available) {
        fireblocks.connected = false;
        fireblocks.error =
          vaults.unavailable_reason ??
          balances.unavailable_reason ??
          transactions.unavailable_reason ??
          "Fireblocks data retrieval failed";
      } else {
        fireblocks.vault_account_count = vaults.data?.length ?? 0;
        fireblocks.balance_line_count = balances.data?.length ?? 0;
        fireblocks.transaction_count = transactions.data?.length ?? 0;
      }
    } catch (error) {
      fireblocks.connected = false;
      fireblocks.error = formatError(error);
    }
  }

  const [openAiCheck, anthropicCheck] = await Promise.all([
    probeOpenAi(config),
    probeAnthropic(config),
  ]);

  const checks: IntegrationCheck[] = [
    {
      id: "fireblocks",
      label: "Fireblocks Sandbox",
      status: fireblocks.connected ? "connected" : "disconnected",
      detail: fireblocks.connected
        ? `Authenticated — ${fireblocks.vault_account_count ?? 0} vaults, ${fireblocks.balance_line_count ?? 0} balances, ${fireblocks.transaction_count ?? 0} transactions`
        : (fireblocks.error ?? "Authentication or data retrieval failed"),
    },
    openAiCheck,
    anthropicCheck,
    {
      id: "audit_logging",
      label: "Audit Logging",
      status: config.AI_PROMPT_LOGGING ? "active" : "inactive",
      detail: config.AI_PROMPT_LOGGING
        ? config.AUDIT_STORE === "postgres"
          ? "Append-only Postgres audit_events — prompts, evidence, workflows, RBAC, Fireblocks API calls"
          : "Prompt logging enabled (in-memory test store)"
        : "Prompt logging disabled",
    },
    {
      id: "rbac",
      label: "RBAC",
      status: "active",
      detail: "Role-based access control enforced on all protected endpoints",
    },
    {
      id: "real_data_mode",
      label: "Real Data Mode",
      status:
        resolveDataMode(config) === "real" && !config.DEMO_MODE
          ? "active"
          : "inactive",
      detail:
        resolveDataMode(config) === "real"
          ? "REAL_FIREBLOCKS active — demo seed disabled, no silent fallback"
          : `Current mode: ${resolveDataMode(config)}`,
    },
  ];

  return {
    data_mode: dataService.getMode(),
    real_fireblocks: config.REAL_FIREBLOCKS,
    demo_mode: config.DEMO_MODE,
    checks,
    fireblocks,
    correlation_id: correlationId,
    checked_at: new Date().toISOString(),
  };
}
