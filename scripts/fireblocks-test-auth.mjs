#!/usr/bin/env node
/**
 * Isolated Fireblocks JWT auth verification.
 * Generates RS256 JWT, calls GET /vault/accounts_paged, fails loudly on error.
 *
 * Usage: pnpm fireblocks:test-auth
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

async function main() {
  const { execSync } = await import("node:child_process");
  execSync("pnpm --filter @taicc/shared-types build && pnpm --filter @taicc/fireblocks-client build", {
    cwd: root,
    stdio: "inherit",
  });

  const { runFireblocksAuthDiagnostics, PEM_REGENERATION_GUIDE } = await import(
    "../packages/fireblocks-client/dist/index.js"
  );

  const apiKey = process.env.FIREBLOCKS_API_KEY?.trim();
  let secretKeyInline = process.env.FIREBLOCKS_PRIVATE_KEY?.trim();
  const secretKeyPath =
    process.env.FIREBLOCKS_SECRET_KEY_PATH?.trim() ?? "./fireblocks_secret.key";
  const basePath =
    process.env.FIREBLOCKS_BASE_PATH?.trim() ??
    "https://sandbox-api.fireblocks.io/v1";

  if (!secretKeyInline) {
    const keyFile = resolve(root, secretKeyPath);
    if (existsSync(keyFile)) {
      secretKeyInline = readFileSync(keyFile, "utf8").trim();
    }
  }

  console.log("\n=== Fireblocks JWT Auth Test ===\n");
  console.log(`Base path: ${basePath}`);
  console.log(`API key:   ${apiKey ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : "(missing)"}`);
  console.log(`Private key: ${secretKeyInline ? "configured" : "MISSING"}\n`);

  if (!apiKey || !secretKeyInline) {
    console.error("✗ FIREBLOCKS_API_KEY and FIREBLOCKS_PRIVATE_KEY (or key file) are required.");
    process.exit(1);
  }

  const diagnostics = await runFireblocksAuthDiagnostics({
    apiKey,
    secretKeyPath,
    secretKeyInline,
    basePath,
  });

  console.log("Private key loaded:", diagnostics.private_key.loaded ? "yes" : "NO");
  console.log("JWT generation:    ", diagnostics.jwt_generation.ok ? "ok" : "FAILED");
  if (diagnostics.jwt_generation.preview?.uri_signed) {
    console.log("URI signed:        ", diagnostics.jwt_generation.preview.uri_signed);
  }
  console.log("Auth header OK:    ", diagnostics.signed_request?.authorization_malformed === false);
  console.log("Sandbox test:      ", diagnostics.auth_test.ok ? "PASS" : "FAIL");
  if (diagnostics.auth_test.http_status != null) {
    console.log("HTTP status:       ", diagnostics.auth_test.http_status);
  }
  if (diagnostics.auth_test.latency_ms != null) {
    console.log("Latency:           ", `${diagnostics.auth_test.latency_ms}ms`);
  }

  if (diagnostics.auth_log.length) {
    console.log("\n--- Auth phases ---");
    for (const entry of diagnostics.auth_log) {
      console.log(`  [${entry.phase}] ${entry.status}: ${entry.detail}`);
    }
  }

  if (diagnostics.auth_test.response_body_preview) {
    console.log("\n--- Fireblocks response (sanitized) ---");
    console.log(diagnostics.auth_test.response_body_preview);
  }

  if (!diagnostics.private_key.loaded && diagnostics.private_key.remediation) {
    console.log("\n--- PEM remediation ---");
    console.log(PEM_REGENERATION_GUIDE ?? diagnostics.private_key.remediation);
  }

  if (!diagnostics.auth_test.ok) {
    console.error("\n✗ FIREBLOCKS AUTH TEST FAILED");
    console.error(diagnostics.auth_test.error ?? diagnostics.jwt_generation.message);
    process.exit(1);
  }

  console.log("\n✓ Fireblocks JWT auth verified against /vault/accounts_paged\n");
}

main().catch((err) => {
  console.error("\n✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
