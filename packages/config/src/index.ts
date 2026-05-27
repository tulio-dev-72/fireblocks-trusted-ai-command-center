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

  MCP_PORT: z.coerce.number().int().positive().default(3100),
  MCP_SERVER_NAME: z.string().default("fireblocks-trusted-ai"),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),

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
      "Customer operational data is never used to train foundation models. AI answers are generated from retrieved Fireblocks evidence only.",
    ),
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedConfig: EnvConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EnvConfig {
  if (cachedConfig) return cachedConfig;

  const result = envSchema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  validateDataMode(result.data);
  cachedConfig = result.data;
  return cachedConfig;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}

export function getCorsOrigins(config: EnvConfig): string[] {
  return config.API_CORS_ORIGINS.split(",").map((o) => o.trim());
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
        "Production requires Fireblocks credentials (FIREBLOCKS_API_KEY and FIREBLOCKS_SECRET_KEY_PATH). " +
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
