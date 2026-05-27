const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");

const rootDir = resolve(__dirname, "..");

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

// Resolve relative paths (e.g. ./fireblocks_secret.key) from repo root
process.chdir(rootDir);
