#!/usr/bin/env node
/**
 * Generate real Fireblocks sandbox activity (vault create, vault-to-vault transfer).
 * Human/CLI only — never invoked by AI workflows.
 *
 * Usage:
 *   pnpm fireblocks:seed-sandbox
 *   pnpm fireblocks:seed-sandbox --no-vault --no-transfer
 *   pnpm fireblocks:seed-sandbox --asset-id ETH_TEST5 --amount 0.001
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

loadEnvFile(resolve(root, ".env"));
loadEnvFile(resolve(root, ".env.local"), true);

const args = process.argv.slice(2);
const createVault = !args.includes("--no-vault");
const transfer = !args.includes("--no-transfer");
const assetIdx = args.indexOf("--asset-id");
const amountIdx = args.indexOf("--amount");
const assetId = assetIdx >= 0 ? args[assetIdx + 1] : undefined;
const amount = amountIdx >= 0 ? args[amountIdx + 1] : undefined;

async function main() {
  const { execSync } = await import("node:child_process");
  execSync(
    "pnpm --filter @taicc/shared-types build && pnpm --filter @taicc/audit build && pnpm --filter @taicc/fireblocks-client build && pnpm --filter @taicc/config build",
    { cwd: root, stdio: "inherit" },
  );

  const { loadConfig, buildFireblocksClientOptions } = await import(
    "../packages/config/dist/index.js"
  );
  const { createAuditLogger } = await import("../packages/audit/dist/index.js");
  const { createFireblocksClient, createSandboxActivityGenerator, assertSandboxBasePath } =
    await import("../packages/fireblocks-client/dist/index.js");
  const { SYSTEM_ACTOR_ID } = await import("../packages/shared-types/dist/index.js");

  const config = loadConfig();
  assertSandboxBasePath(config.FIREBLOCKS_BASE_PATH);

  const auditHandle = await createAuditLogger({
    databaseUrl: config.DATABASE_URL,
    store: config.AUDIT_STORE,
    bootstrap: config.AUDIT_BOOTSTRAP_SCHEMA,
  });

  const client = createFireblocksClient(
    buildFireblocksClientOptions(config),
    auditHandle.logger,
  );

  const generator = createSandboxActivityGenerator({
    client,
    config: buildFireblocksClientOptions(config),
    auditLogger: auditHandle.logger,
  });

  const correlationId = randomUUID();
  const ctx = { correlationId, actorId: SYSTEM_ACTOR_ID };

  console.log("\n=== Fireblocks Sandbox Activity Generator ===\n");
  console.log(`Base path: ${config.FIREBLOCKS_BASE_PATH}`);
  console.log(`Create vault: ${createVault}`);
  console.log(`Transfer:     ${transfer}`);
  if (assetId) console.log(`Asset:        ${assetId}`);
  if (amount) console.log(`Amount:       ${amount}`);
  console.log("");

  const result = await generator.runDefaultSeed(ctx, SYSTEM_ACTOR_ID, {
    createVault,
    transfer,
    assetId,
    amount,
  });

  for (const step of result.steps) {
    console.log(`  [${step.ok ? "OK" : "FAIL"}] ${step.action}: ${step.detail}`);
  }

  console.log("\n--- Result ---");
  console.log(result.message);
  if (result.vault_count != null) console.log(`Vaults:   ${result.vault_count}`);
  if (result.external_wallet_count != null) {
    console.log(`Wallets:  ${result.external_wallet_count}`);
  }
  if (result.balance_line_count != null) {
    console.log(`Balances: ${result.balance_line_count} lines`);
  }

  await auditHandle.shutdown();

  if (!result.ok) {
    console.error("\n✗ SANDBOX ACTIVITY GENERATION FAILED");
    for (const err of result.errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log("\n✓ Sandbox activity recorded as REAL_FIREBLOCKS_SANDBOX in audit_events\n");
}

main().catch((err) => {
  console.error("\n✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
