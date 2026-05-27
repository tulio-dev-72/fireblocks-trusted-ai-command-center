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

const { loadConfig, resolveDataMode, buildFireblocksClientOptions } = await import("../packages/config/dist/index.js");
const { createAuditLogger, verifyAuditPersistence } = await import("../packages/audit/dist/index.js");
const { createFireblocksClient } = await import("../packages/fireblocks-client/dist/index.js");
const { createConnectionVerificationService } = await import("../packages/fireblocks-client/dist/index.js");
const { resolveLlmConfig, generateGroundedAnswer } = await import("../packages/trusted-ai/dist/llm-provider.js");
const { generateCorrelationId } = await import("../packages/observability/dist/index.js");
const { SYSTEM_ACTOR_ID } = await import("../packages/shared-types/dist/index.js");

const config = loadConfig();
const mode = resolveDataMode(config);
const auditHandle = await createAuditLogger({
  databaseUrl: config.DATABASE_URL,
  store: config.AUDIT_STORE,
  bootstrap: config.AUDIT_BOOTSTRAP_SCHEMA,
});
const auditLogger = auditHandle.logger;

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

// Audit persistence (Postgres append-only)
try {
  const auditCheck = await verifyAuditPersistence(
    auditLogger,
    "00000000-0000-4000-8000-000000000099",
  );
  if (auditCheck.ok) {
    pass(`audit.${config.AUDIT_STORE}`, auditCheck.detail);
  } else {
    fail(`audit.${config.AUDIT_STORE}`, auditCheck.detail);
  }
} catch (error) {
  fail(`audit.${config.AUDIT_STORE}`, error instanceof Error ? error.message : String(error));
}

// Fireblocks
try {
  const client = createFireblocksClient(
    buildFireblocksClientOptions(config),
    auditLogger,
  );
  const verification = createConnectionVerificationService(
    {
      ...buildFireblocksClientOptions(config),
      dataMode: mode,
      realFireblocks: config.REAL_FIREBLOCKS,
      demoMode: config.DEMO_MODE,
      hybridMode: config.HYBRID_MODE,
    },
    client,
  );
  const verifyCorrelationId = generateCorrelationId();
  const status = await verification.verifyConnection({
    correlationId: verifyCorrelationId,
    actorId: SYSTEM_ACTOR_ID,
    workspaceId: config.FIREBLOCKS_WORKSPACE_ID,
  });

  for (const check of status.credential_checks ?? []) {
    if (check.valid) {
      pass(`fireblocks.${check.check}`, check.message);
    } else {
      fail(`fireblocks.${check.check}`, check.message);
    }
  }

  if (!status.connected || !status.sandbox_mode) {
    fail("fireblocks.connection", status.error ?? "Not connected to Fireblocks sandbox");
  } else {
    pass(
      "fireblocks.connection",
      `Sandbox connected (${status.api_latency_ms ?? "?"}ms) — ${status.reachable_endpoints?.length ?? 0} endpoints reachable`,
    );
  }

  if (status.connected) {
    const { createDataService } = await import("../packages/data-layer/dist/index.js");
    const dataService = createDataService(config, client);
    const ctx = { correlationId: verifyCorrelationId, actorId: SYSTEM_ACTOR_ID };

    const [vaults, balances, txs] = await Promise.all([
      dataService.listVaultAccounts(ctx),
      dataService.listBalances(ctx),
      dataService.listTransactions(ctx),
    ]);

    if (vaults.available && vaults.provenance.source_type === "REAL_FIREBLOCKS") {
      pass("fireblocks.vault_accounts", `${vaults.data?.length ?? 0} vault account(s) retrieved`);
    } else {
      fail("fireblocks.vault_accounts", vaults.unavailable_reason ?? "Vault retrieval failed");
    }

    if (balances.available && balances.provenance.source_type === "REAL_FIREBLOCKS") {
      pass("fireblocks.balances", `${balances.data?.length ?? 0} balance line(s) retrieved`);
    } else {
      fail("fireblocks.balances", balances.unavailable_reason ?? "Balance retrieval failed");
    }

    if (txs.available && txs.provenance.source_type === "REAL_FIREBLOCKS") {
      pass("fireblocks.transactions", `${txs.data?.length ?? 0} transaction(s) retrieved`);
    } else {
      fail("fireblocks.transactions", txs.unavailable_reason ?? "Transaction retrieval failed");
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
await auditHandle.shutdown();
process.exit(failed.length > 0 ? 1 : 0);
