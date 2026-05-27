import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import type { DataMode } from "@taicc/shared-types";

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === "true" || v === "1");

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().default("0.0.0.0"),
  API_CORS_ORIGINS: z.string().default("http://localhost:5173"),
  /** Production Vercel web URL — must match the single entry in API_CORS_ORIGINS */
  PUBLIC_FRONTEND_URL: z.string().url().optional(),

  MCP_PORT: z.coerce.number().int().positive().default(3100),
  MCP_SERVER_NAME: z.string().default("fireblocks-trusted-ai"),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),

  /** Shared read-only bearer for public dashboard (VITE_API_TOKEN) — not a Fireblocks JWT */
  API_VIEWER_TOKEN: z.string().min(32).optional(),

  JWT_SECRET: z.string().min(16),
  JWT_ISSUER: z.string().default("fireblocks-trusted-ai-command-center"),
  JWT_AUDIENCE: z.string().default("command-center"),

  /** Seed data only — never enabled in production */
  DEMO_MODE: bool.default(false),
  /** Pull live data from Fireblocks APIs */
  REAL_FIREBLOCKS: bool.default(true),
  /** Real metadata + clearly labeled mocked fields */
  HYBRID_MODE: bool.default(false),

  FIREBLOCKS_API_KEY: z.string().optional(),
  /** RSA PEM for cloud deployments — never commit; use platform secret store */
  FIREBLOCKS_PRIVATE_KEY: z.string().optional(),
  FIREBLOCKS_SECRET_KEY_PATH: z.string().default("./fireblocks_secret.key"),
  FIREBLOCKS_BASE_PATH: z
    .string()
    .url()
    .default("https://sandbox-api.fireblocks.io/v1"),
  FIREBLOCKS_WORKSPACE_ID: z.string().optional(),
  FIREBLOCKS_WEBHOOK_ID: z.string().optional(),

  POLICY_ENFORCEMENT_MODE: z
    .enum(["enforce", "audit_only", "disabled"])
    .default("enforce"),
  POLICY_DEFAULT_ACTION: z.enum(["allow", "deny"]).default("deny"),

  DATABASE_URL: z
    .string()
    .default("postgresql://taicc:taicc@localhost:5432/taicc"),

  /** postgres (default) | memory (test-only fallback) */
  AUDIT_STORE: z.enum(["postgres", "memory"]).default("postgres"),
  AUDIT_BOOTSTRAP_SCHEMA: bool.default(true),

  OTEL_EXPORTER_OTLP_ENDPOINT: z
    .string()
    .url()
    .optional(),
  OTEL_SERVICE_NAME: z
    .string()
    .default("trusted-ai-command-center"),

  /** openai | anthropic | auto (first configured provider wins) */
  AI_PROVIDER: z.enum(["openai", "anthropic", "auto"]).default("auto"),
  AI_MODEL: z.string().default("gpt-4o-mini"),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-20250514"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_PROMPT_LOGGING: bool.default(true),
  AI_NO_TRAINING_STATEMENT: z
    .string()
    .default(
      "When OpenAI or Anthropic is configured, prompts are sent to that provider API. See provider data-use documentation for retention and training policies. Local evidence formatting does not call an external model.",
    ),
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedConfig: EnvConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EnvConfig {
  if (cachedConfig) return cachedConfig;

  const normalizedEnv = { ...env };
  // Render/Railway set PORT — bind API to platform-assigned port
  if (normalizedEnv.PORT) {
    normalizedEnv.API_PORT = normalizedEnv.PORT;
  }

  const result = envSchema.safeParse(normalizedEnv);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  validateDataMode(result.data);
  validateProductionConfig(result.data);
  cachedConfig = result.data;
  return cachedConfig;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}

export function getCorsOrigins(config: EnvConfig): string[] {
  if (config.NODE_ENV === "production" && config.PUBLIC_FRONTEND_URL) {
    return [config.PUBLIC_FRONTEND_URL.replace(/\/$/, "")];
  }
  return config.API_CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function resolveDataMode(config: EnvConfig): DataMode {
  if (config.DEMO_MODE) return "demo";
  if (config.HYBRID_MODE) return "hybrid";
  if (config.REAL_FIREBLOCKS) return "real";
  return "real";
}

export function fireblocksCredentialsPresent(config: EnvConfig): {
  apiKey: boolean;
  secretKey: boolean;
} {
  const apiKey = Boolean(config.FIREBLOCKS_API_KEY?.trim());
  if (config.FIREBLOCKS_PRIVATE_KEY?.trim()) {
    return { apiKey, secretKey: true };
  }
  let secretKey = false;
  try {
    if (existsSync(config.FIREBLOCKS_SECRET_KEY_PATH)) {
      const content = readFileSync(config.FIREBLOCKS_SECRET_KEY_PATH, "utf-8");
      secretKey = content.trim().length > 0;
    }
  } catch {
    secretKey = false;
  }
  return { apiKey, secretKey };
}

export function buildFireblocksClientOptions(config: EnvConfig) {
  return {
    apiKey: config.FIREBLOCKS_API_KEY ?? "",
    secretKeyPath: config.FIREBLOCKS_SECRET_KEY_PATH,
    secretKeyInline: config.FIREBLOCKS_PRIVATE_KEY,
    basePath: config.FIREBLOCKS_BASE_PATH,
    workspaceId: config.FIREBLOCKS_WORKSPACE_ID,
  };
}

const WEAK_JWT_SECRETS = new Set([
  "change-me-in-production-use-kms",
  "dev-secret-change-me",
  "secret",
]);

/** Production fails closed when required secrets or stores are missing. */
export function validateProductionConfig(config: EnvConfig): void {
  if (config.NODE_ENV !== "production") return;

  if (
    !config.JWT_SECRET ||
    config.JWT_SECRET.length < 32 ||
    WEAK_JWT_SECRETS.has(config.JWT_SECRET)
  ) {
    throw new Error(
      "Production requires JWT_SECRET with at least 32 characters (not a default placeholder).",
    );
  }

  if (config.AUDIT_STORE === "postgres") {
    if (!config.DATABASE_URL?.startsWith("postgresql://")) {
      throw new Error("Production requires DATABASE_URL (postgresql://) for AUDIT_STORE=postgres.");
    }
  }

  if (config.AUDIT_STORE === "memory") {
    throw new Error("AUDIT_STORE=memory is forbidden in production. Use postgres.");
  }

  const cors = getCorsOrigins(config);
  if (cors.length !== 1) {
    throw new Error(
      "Production requires exactly one frontend origin — set PUBLIC_FRONTEND_URL or a single API_CORS_ORIGINS value.",
    );
  }
  if (cors[0]?.includes("localhost")) {
    throw new Error(
      "Production CORS must be your public Vercel web URL — localhost is not allowed.",
    );
  }

  if (!config.FIREBLOCKS_PRIVATE_KEY?.trim()) {
    throw new Error(
      "Production requires FIREBLOCKS_PRIVATE_KEY as an environment variable (do not rely on local key files).",
    );
  }

  if (!config.FIREBLOCKS_API_KEY?.trim()) {
    throw new Error("Production requires FIREBLOCKS_API_KEY.");
  }

  const hasLlm =
    Boolean(config.OPENAI_API_KEY?.trim()) || Boolean(config.ANTHROPIC_API_KEY?.trim());
  if (!hasLlm) {
    throw new Error(
      "Production requires at least one LLM provider key (OPENAI_API_KEY or ANTHROPIC_API_KEY).",
    );
  }

  if (!config.REDIS_URL?.startsWith("redis")) {
    throw new Error("Production requires REDIS_URL (Upstash redis:// or rediss:// URL).");
  }

  if (!config.API_VIEWER_TOKEN?.trim()) {
    throw new Error(
      "Production requires API_VIEWER_TOKEN (≥32 chars) for read-only web UI auth. " +
        "Set the same value as VITE_API_TOKEN on Vercel.",
    );
  }

  if (!config.REAL_FIREBLOCKS) {
    throw new Error("Production requires REAL_FIREBLOCKS=true.");
  }

  if (config.DEMO_MODE) {
    throw new Error("DEMO_MODE=true is forbidden in production.");
  }

  if (config.HYBRID_MODE) {
    throw new Error("HYBRID_MODE=true is forbidden in production.");
  }
}

/**
 * Production fails closed if Fireblocks credentials are missing in real mode.
 * Never silently fall back from real to demo.
 */
export function validateDataMode(config: EnvConfig): void {
  const mode = resolveDataMode(config);

  if (config.NODE_ENV === "production") {
    if (config.DEMO_MODE) {
      throw new Error(
        "DEMO_MODE=true is forbidden in production. Set DEMO_MODE=false.",
      );
    }
    if (config.HYBRID_MODE) {
      throw new Error(
        "HYBRID_MODE=true is forbidden in production. Use REAL_FIREBLOCKS=true.",
      );
    }
    if (!config.REAL_FIREBLOCKS) {
      throw new Error(
        "REAL_FIREBLOCKS must be true in production.",
      );
    }
    const creds = fireblocksCredentialsPresent(config);
    if (!creds.apiKey || !creds.secretKey) {
      throw new Error(
        "Production requires Fireblocks credentials (FIREBLOCKS_API_KEY and FIREBLOCKS_PRIVATE_KEY). " +
          "Refusing to start — no silent fallback to demo data.",
      );
    }
  }

  if (mode === "demo" && config.NODE_ENV === "production") {
    throw new Error("Demo mode cannot run in production.");
  }

  if (mode === "real" || mode === "hybrid") {
    const creds = fireblocksCredentialsPresent(config);
    if (!creds.apiKey || !creds.secretKey) {
      if (mode === "real" && config.NODE_ENV !== "test") {
        throw new Error(
          `Data mode "${mode}" requires Fireblocks credentials. ` +
            "Configure FIREBLOCKS_API_KEY and FIREBLOCKS_SECRET_KEY_PATH, " +
            "or set DEMO_MODE=true for local UI development only.",
        );
      }
    }
  }

  const activeModes = [
    config.DEMO_MODE,
    config.HYBRID_MODE,
    config.REAL_FIREBLOCKS && !config.DEMO_MODE && !config.HYBRID_MODE,
  ].filter(Boolean).length;

  if (config.DEMO_MODE && config.HYBRID_MODE) {
    throw new Error("DEMO_MODE and HYBRID_MODE cannot both be true.");
  }
  if (config.DEMO_MODE && config.REAL_FIREBLOCKS) {
    throw new Error(
      "DEMO_MODE=true requires REAL_FIREBLOCKS=false. Demo mode uses seed data only.",
    );
  }
  if (activeModes === 0) {
    throw new Error(
      "No data mode active. Set REAL_FIREBLOCKS=true, DEMO_MODE=true, or HYBRID_MODE=true.",
    );
  }
}
