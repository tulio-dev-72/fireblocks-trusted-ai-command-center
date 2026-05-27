#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath, override = false) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(rootDir, ".env"));
loadEnvFile(resolve(rootDir, ".env.local"), true);
process.chdir(rootDir);

const { loadConfig, resolveDataMode } = await import("../packages/config/dist/index.js");
const { AuditLogger, InMemoryAuditStore } = await import("../packages/audit/dist/index.js");
const { createFireblocksClient } = await import("../packages/fireblocks-client/dist/index.js");
const { createConnectionVerificationService } = await import("../packages/fireblocks-client/dist/index.js");
const { resolveLlmConfig, generateGroundedAnswer } = await import("../packages/trusted-ai/dist/llm-provider.js");

const config = loadConfig();
const mode = resolveDataMode(config);
const auditLogger = new AuditLogger(new InMemoryAuditStore());

const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}: ${detail}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}: ${detail}`);
}

console.log(`Data mode: ${mode} (DEMO_MODE=${config.DEMO_MODE}, REAL_FIREBLOCKS=${config.REAL_FIREBLOCKS}, HYBRID_MODE=${config.HYBRID_MODE})\n`);

if (mode !== "real") {
  fail("data_mode", `Expected real mode, got "${mode}"`);
} else {
  pass("data_mode", "REAL_FIREBLOCKS active — demo seed disabled");
}

// Fireblocks
try {
  const client = createFireblocksClient(
    {
      apiKey: config.FIREBLOCKS_API_KEY ?? "",
      secretKeyPath: config.FIREBLOCKS_SECRET_KEY_PATH,
      basePath: config.FIREBLOCKS_BASE_PATH,
      workspaceId: config.FIREBLOCKS_WORKSPACE_ID,
    },
    auditLogger,
  );
  const verification = createConnectionVerificationService(
    {
      apiKey: config.FIREBLOCKS_API_KEY ?? "",
      secretKeyPath: config.FIREBLOCKS_SECRET_KEY_PATH,
      basePath: config.FIREBLOCKS_BASE_PATH,
      workspaceId: config.FIREBLOCKS_WORKSPACE_ID,
      dataMode: mode,
      realFireblocks: config.REAL_FIREBLOCKS,
      demoMode: config.DEMO_MODE,
      hybridMode: config.HYBRID_MODE,
    },
    client,
  );
  const status = await verification.verifyConnection({
    correlationId: "verify-connectivity",
    actorId: "system",
    workspaceId: config.FIREBLOCKS_WORKSPACE_ID,
  });
  if (status.connected && status.sandbox_mode) {
    pass(
      "fireblocks",
      `Connected to sandbox (${status.api_latency_ms ?? "?"}ms) — ${status.reachable_endpoints?.length ?? 0} endpoints reachable`,
    );
  } else {
    fail("fireblocks", status.error ?? status.message ?? "Not connected");
    for (const check of status.credential_checks ?? []) {
      if (!check.valid) fail(`fireblocks.${check.check}`, check.message);
    }
  }
} catch (error) {
  fail("fireblocks", error instanceof Error ? error.message : String(error));
}

// OpenAI
const openAiKey = config.OPENAI_API_KEY?.trim();
if (!openAiKey) {
  fail("openai", "OPENAI_API_KEY not set");
} else {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.AI_MODEL,
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
      }),
    });
    if (!response.ok) {
      fail("openai", `HTTP ${response.status}: ${(await response.text()).slice(0, 160)}`);
    } else {
      pass("openai", `Model ${config.AI_MODEL} responded`);
    }
  } catch (error) {
    fail("openai", error instanceof Error ? error.message : String(error));
  }
}

// Anthropic
const anthropicKey = config.ANTHROPIC_API_KEY?.trim();
if (!anthropicKey) {
  fail("anthropic", "ANTHROPIC_API_KEY not set");
} else {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.ANTHROPIC_MODEL,
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
      }),
    });
    if (!response.ok) {
      fail("anthropic", `HTTP ${response.status}: ${(await response.text()).slice(0, 160)}`);
    } else {
      pass("anthropic", `Model ${config.ANTHROPIC_MODEL} responded`);
    }
  } catch (error) {
    fail("anthropic", error instanceof Error ? error.message : String(error));
  }
}

// Platform LLM routing smoke test
try {
  const llmConfig = resolveLlmConfig(config);
  const llmResult = await generateGroundedAnswer(
    {
      question: "Connectivity check",
      context: "Test evidence [ev-1]: sandbox vault balance 1000 USDC",
      citations: [{ id: "cite-ev-1", evidence_id: "ev-1", label: "Balance", excerpt: "1000 USDC" }],
    },
    llmConfig,
  );
  pass("llm_routing", `Active provider: ${llmResult.provider} (${llmResult.modelId})`);
} catch (error) {
  fail("llm_routing", error instanceof Error ? error.message : String(error));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
