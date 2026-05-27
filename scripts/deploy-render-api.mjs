#!/usr/bin/env node
/**
 * Deploy taicc-api to Render with production env from .env + .env.local.
 *
 * Prerequisites (one-time):
 *   1. Render API key → https://dashboard.render.com/u/settings#api-keys
 *      Add to .env.local: RENDER_API_KEY=rnd_...
 *   2. Neon DATABASE_URL (postgresql://…neon…?sslmode=require)
 *   3. Upstash REDIS_URL (rediss://…)
 *
 * Usage:
 *   node scripts/deploy-render-api.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

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

const RENDER_API_KEY = process.env.RENDER_API_KEY?.trim();
const PUBLIC_FRONTEND_URL =
  process.env.PUBLIC_FRONTEND_URL?.trim() ??
  "https://fireblocks-trusted-ai-command-cente.vercel.app";
const REPO = "https://github.com/tulio-dev-72/fireblocks-trusted-ai-command-center";
const SERVICE_NAME = "taicc-api";

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

if (!RENDER_API_KEY) {
  fail(
    "RENDER_API_KEY not set.\n" +
      "  1. Open https://dashboard.render.com/u/settings#api-keys\n" +
      "  2. Create API key → add to .env.local:\n" +
      "     RENDER_API_KEY=rnd_...\n" +
      "  3. Re-run: node scripts/deploy-render-api.mjs",
  );
}

let databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl?.includes("neon.tech") && !databaseUrl?.includes("neon.")) {
  fail(
    "Production DATABASE_URL must be Neon (postgresql://…neon…).\n" +
      "  Create at https://console.neon.tech → add pooled URL to .env.local",
  );
}

let redisUrl = process.env.REDIS_URL?.trim();
if (!redisUrl?.startsWith("rediss://") && !process.env.UPSTASH_REDIS_URL) {
  if (process.env.UPSTASH_REDIS_URL) redisUrl = process.env.UPSTASH_REDIS_URL;
  else if (redisUrl?.includes("localhost")) {
    fail(
      "Production REDIS_URL must be Upstash (rediss://…).\n" +
        "  Create at https://console.upstash.com → add URL to .env.local",
    );
  }
}

async function renderFetch(path, options = {}) {
  const res = await fetch(`https://api.render.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`Render API ${path} → ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  }
  return body;
}

async function readRenderEnvVar(serviceId, key) {
  try {
    const rows = await renderFetch(`/services/${serviceId}/env-vars?limit=100`);
    const match = rows?.find?.((row) => row.envVar?.key === key)?.envVar?.value;
    return typeof match === "string" ? match.trim() : null;
  } catch {
    return null;
  }
}

async function resolveDeploySecrets(serviceId) {
  let jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.includes("change-me")) {
    const existing = serviceId ? await readRenderEnvVar(serviceId, "JWT_SECRET") : null;
    if (existing && existing.length >= 32) {
      jwtSecret = existing;
      ok(`Using JWT_SECRET from Render (${jwtSecret.length} chars)`);
    } else {
      jwtSecret = randomBytes(32).toString("hex");
      ok(`Generated JWT_SECRET (${jwtSecret.length} chars) — persist in .env.local and Render`);
    }
  } else {
    ok(`Using JWT_SECRET from env (${jwtSecret.length} chars)`);
  }

  let apiViewerToken = process.env.API_VIEWER_TOKEN?.trim();
  if (!apiViewerToken || apiViewerToken.length < 32) {
    const existing = serviceId ? await readRenderEnvVar(serviceId, "API_VIEWER_TOKEN") : null;
    if (existing && existing.length >= 32) {
      apiViewerToken = existing;
      ok(`Using API_VIEWER_TOKEN from Render (${apiViewerToken.length} chars)`);
    } else {
      apiViewerToken = randomBytes(32).toString("hex");
      ok(`Generated API_VIEWER_TOKEN — set VITE_API_TOKEN on Vercel to this value`);
    }
  } else {
    ok(`Using API_VIEWER_TOKEN from env (${apiViewerToken.length} chars)`);
  }

  let sandboxAdminToken = process.env.SANDBOX_ADMIN_TOKEN?.trim();
  if (!sandboxAdminToken || sandboxAdminToken.length < 32) {
    const existing = serviceId ? await readRenderEnvVar(serviceId, "SANDBOX_ADMIN_TOKEN") : null;
    if (existing && existing.length >= 32) {
      sandboxAdminToken = existing;
      ok(`Using SANDBOX_ADMIN_TOKEN from Render (${sandboxAdminToken.length} chars)`);
    } else {
      sandboxAdminToken = randomBytes(32).toString("hex");
      ok(`Generated SANDBOX_ADMIN_TOKEN — use for sandbox activity UI/CLI (not VITE_API_TOKEN)`);
    }
  } else {
    ok(`Using SANDBOX_ADMIN_TOKEN from env (${sandboxAdminToken.length} chars)`);
  }

  return { jwtSecret, apiViewerToken, sandboxAdminToken };
}

function loadFireblocksPrivateKey() {
  let fireblocksPrivateKey = process.env.FIREBLOCKS_PRIVATE_KEY?.trim();
  const keyPath = process.env.FIREBLOCKS_SECRET_KEY_PATH?.trim() ?? "./fireblocks_secret.key";
  const resolvedKeyPath = resolve(root, keyPath);
  if (!fireblocksPrivateKey && existsSync(resolvedKeyPath)) {
    fireblocksPrivateKey = readFileSync(resolvedKeyPath, "utf8").trim();
  }
  if (!fireblocksPrivateKey?.includes("PRIVATE KEY")) {
    fail("FIREBLOCKS_PRIVATE_KEY or fireblocks_secret.key required");
  }
  return fireblocksPrivateKey;
}

function buildEnvVars(secrets) {
  const fireblocksPrivateKey = loadFireblocksPrivateKey();
  const fireblocksApiKey = process.env.FIREBLOCKS_API_KEY?.trim();
  if (!fireblocksApiKey) fail("FIREBLOCKS_API_KEY required in .env.local");

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!openAiKey && !anthropicKey) {
    fail("At least one of OPENAI_API_KEY or ANTHROPIC_API_KEY required");
  }

  const envVars = [
    { key: "NODE_ENV", value: "production" },
    { key: "API_HOST", value: "0.0.0.0" },
    { key: "DEMO_MODE", value: "false" },
    { key: "REAL_FIREBLOCKS", value: "true" },
    { key: "HYBRID_MODE", value: "false" },
    { key: "AUDIT_STORE", value: "postgres" },
    { key: "AUDIT_BOOTSTRAP_SCHEMA", value: "true" },
    { key: "DATABASE_URL", value: databaseUrl },
    { key: "JWT_SECRET", value: secrets.jwtSecret },
    { key: "API_VIEWER_TOKEN", value: secrets.apiViewerToken },
    { key: "SANDBOX_ADMIN_TOKEN", value: secrets.sandboxAdminToken },
    { key: "FIREBLOCKS_API_KEY", value: fireblocksApiKey },
    { key: "FIREBLOCKS_PRIVATE_KEY", value: fireblocksPrivateKey },
    {
      key: "FIREBLOCKS_BASE_PATH",
      value: process.env.FIREBLOCKS_BASE_PATH ?? "https://sandbox-api.fireblocks.io/v1",
    },
    { key: "PUBLIC_FRONTEND_URL", value: PUBLIC_FRONTEND_URL.replace(/\/$/, "") },
    { key: "REDIS_URL", value: redisUrl },
    { key: "AI_PROVIDER", value: process.env.AI_PROVIDER ?? "auto" },
  ];
  if (openAiKey) envVars.push({ key: "OPENAI_API_KEY", value: openAiKey });
  if (anthropicKey) envVars.push({ key: "ANTHROPIC_API_KEY", value: anthropicKey });
  return envVars;
}

async function main() {
  ok("Render API key found");

  const owners = await renderFetch("/owners?limit=20");
  const owner = owners?.[0]?.owner ?? owners?.[0];
  const ownerId = owner?.id ?? owner?.owner?.id;
  if (!ownerId) fail("Could not resolve Render owner/workspace ID");

  ok(`Render workspace: ${owner?.name ?? ownerId}`);

  const services = await renderFetch(`/services?limit=100&name=${SERVICE_NAME}`);
  let service = services?.find?.((s) => s.service?.name === SERVICE_NAME)?.service;

  const secrets = await resolveDeploySecrets(service?.id);
  const envVars = buildEnvVars(secrets);
  const { apiViewerToken, sandboxAdminToken } = secrets;

  if (!service) {
    ok(`Creating Docker web service "${SERVICE_NAME}"…`);
    const created = await renderFetch("/services", {
      method: "POST",
      body: JSON.stringify({
        type: "web_service",
        name: SERVICE_NAME,
        ownerId,
        repo: REPO,
        branch: "main",
        autoDeploy: "yes",
        serviceDetails: {
          env: "docker",
          healthCheckPath: "/health/ready",
          plan: "starter",
          envSpecificDetails: {
            dockerfilePath: "./apps/api/Dockerfile",
            dockerContext: ".",
          },
          envVars: envVars.map((v) => ({ key: v.key, value: v.value })),
        },
      }),
    });
    service = created;
    ok(`Service created: ${service.serviceDetails?.url ?? service.slug}`);
  } else {
    ok(`Updating service "${SERVICE_NAME}"…`);
    await renderFetch(`/services/${service.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        serviceDetails: {
          envSpecificDetails: {
            dockerfilePath: "./apps/api/Dockerfile",
            dockerContext: ".",
          },
          healthCheckPath: "/health/ready",
        },
      }),
    });
    ok("Dockerfile path set to ./apps/api/Dockerfile");
    ok(`Updating env on existing service "${SERVICE_NAME}"…`);
    for (const v of envVars) {
      await renderFetch(`/services/${service.id}/env-vars/${encodeURIComponent(v.key)}`, {
        method: "PUT",
        body: JSON.stringify({ value: v.value }),
      }).catch(async () => {
        await renderFetch(`/services/${service.id}/env-vars`, {
          method: "POST",
          body: JSON.stringify({ envVar: { key: v.key, value: v.value } }),
        });
      });
    }
    ok("Environment variables updated");
    await renderFetch(`/services/${service.id}/deploys`, {
      method: "POST",
      body: JSON.stringify({ clearCache: "do_not_clear" }),
    });
    ok("Deploy triggered");
  }

  const url = service.serviceDetails?.url ?? `https://${SERVICE_NAME}.onrender.com`;
  console.log("\n---");
  console.log(`API URL: ${url}`);
  console.log(`CORS frontend: ${PUBLIC_FRONTEND_URL}`);
  console.log(`Health: ${url}/health/ready`);
  console.log(`Fireblocks auth diagnostics: ${url}/health/fireblocks/auth-diagnostics`);
  console.log("\nVercel web env (required for dashboard data):");
  console.log(`  VITE_API_URL=${url}`);
  console.log(`  VITE_API_TOKEN=${apiViewerToken}`);
  console.log(`\nSandbox activity (admin-only, separate from viewer):`);
  console.log(`  SANDBOX_ADMIN_TOKEN=${sandboxAdminToken}`);
  console.log("\nWait ~3–5 min for first Docker build, then:");
  console.log(`  curl ${url}/health`);
}

main().catch((err) => fail(err.message));
