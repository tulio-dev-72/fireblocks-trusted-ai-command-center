#!/usr/bin/env node
/**
 * Thin wrapper around the official Fireblocks CLI (@fireblocks/fireblocks-cli).
 *
 * It loads this repo's .env / .env.local, maps the repo's credential
 * conventions (FIREBLOCKS_PRIVATE_KEY / FIREBLOCKS_SECRET_KEY_PATH /
 * FIREBLOCKS_BASE_PATH) onto the names the official CLI expects
 * (FIREBLOCKS_SECRET_KEY[_PATH] / FIREBLOCKS_BASE_URL), then forwards every
 * argument straight to the real `fireblocks` binary.
 *
 * Usage:
 *   pnpm fireblocks whoami
 *   pnpm fireblocks vaults get-paged-vault-accounts --json
 *   pnpm fireblocks help-index
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
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

// Relative key paths (e.g. ./fireblocks_secret.key) resolve from repo root.
process.chdir(root);

// ── map repo credentials onto the official CLI's env names ──────────────────
const env = { ...process.env };

// Secret: prefer an inline PEM, else a key-file path (default ./fireblocks_secret.key).
if (!env.FIREBLOCKS_SECRET_KEY && !env.FIREBLOCKS_SECRET_KEY_PATH) {
  if (env.FIREBLOCKS_PRIVATE_KEY?.trim()) {
    env.FIREBLOCKS_SECRET_KEY = env.FIREBLOCKS_PRIVATE_KEY;
  } else {
    env.FIREBLOCKS_SECRET_KEY_PATH = "./fireblocks_secret.key";
  }
}

// Base URL: the CLI wants the host without the /v1 suffix the SDK base path carries.
if (!env.FIREBLOCKS_BASE_URL) {
  const basePath = env.FIREBLOCKS_BASE_PATH?.trim() || "https://sandbox-api.fireblocks.io/v1";
  env.FIREBLOCKS_BASE_URL = basePath.replace(/\/v1\/?$/, "");
}

// ── resolve and run the official CLI binary ─────────────────────────────────
let binPath;
try {
  const pkgJson = require.resolve("@fireblocks/fireblocks-cli/package.json");
  binPath = resolve(dirname(pkgJson), "bin/run.js");
} catch {
  console.error(
    "@fireblocks/fireblocks-cli is not installed. Run `pnpm install` (it is a devDependency)\n" +
      "or install globally: npm install -g @fireblocks/fireblocks-cli",
  );
  process.exit(127);
}

const child = spawn(process.execPath, [binPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
