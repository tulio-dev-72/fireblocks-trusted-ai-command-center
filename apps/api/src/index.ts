import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig, getCorsOrigins, resolveDataMode } from "@taicc/config";
import { AuthService, extractBearerToken, AuthError, type Permission } from "@taicc/auth";
import { AuditLogger, InMemoryAuditStore } from "@taicc/audit";
import { createFireblocksClient } from "@taicc/fireblocks-client";
import { createDataService } from "@taicc/data-layer";
import {
  createEvidencePipeline,
  createDelayedPaymentsWorkflow,
  buildTrustCenterStatus,
  buildSystemIntegrationStatus,
} from "@taicc/trusted-ai";
import { createLogger, generateCorrelationId } from "@taicc/observability";
import type { Actor, ProvenanceRecord } from "@taicc/shared-types";
import {
  TreasuryAnalysisRequestSchema,
  AiAskRequestSchema,
  DelayedPaymentsInvestigationRequestSchema,
  EscalationSummaryRequestSchema,
} from "@taicc/shared-types";

const config = loadConfig();
const logger = createLogger("api", config.LOG_LEVEL);
const dataMode = resolveDataMode(config);

const authService = new AuthService({
  jwtSecret: config.JWT_SECRET,
  issuer: config.JWT_ISSUER,
  audience: config.JWT_AUDIENCE,
});

const auditLogger = new AuditLogger(new InMemoryAuditStore());

const fireblocksClient = createFireblocksClient(
  {
    apiKey: config.FIREBLOCKS_API_KEY ?? "",
    secretKeyPath: config.FIREBLOCKS_SECRET_KEY_PATH,
    basePath: config.FIREBLOCKS_BASE_PATH,
    workspaceId: config.FIREBLOCKS_WORKSPACE_ID,
  },
  auditLogger,
);

const dataService = createDataService(config, fireblocksClient);
const evidencePipeline = createEvidencePipeline(dataService, auditLogger, config);
const delayedPaymentsWorkflow = createDelayedPaymentsWorkflow(
  dataService,
  auditLogger,
  config,
);

try {
  dataService.assertReady();
} catch (error) {
  logger.error("Fireblocks startup validation failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  if (config.REAL_FIREBLOCKS && !config.DEMO_MODE) {
    throw error;
  }
}

interface RequestContext {
  correlationId: string;
  actor: Actor | null;
}

function fbCtx(ctx: RequestContext) {
  return { correlationId: ctx.correlationId, actorId: ctx.actor?.id };
}

async function auditRbac(
  actor: Actor,
  permission: Permission,
  correlationId: string,
  allowed: boolean,
): Promise<void> {
  await auditLogger.record({
    correlationId,
    eventType: "rbac_filter",
    actorId: actor.id,
    action: permission,
    outcome: allowed ? "success" : "denied",
    metadata: { roles: actor.roles },
  });
}

async function requirePermission(
  actor: Actor,
  permission: Permission,
  correlationId: string,
): Promise<void> {
  const allowed = authService.hasPermission(actor, permission);
  await auditRbac(actor, permission, correlationId, allowed);
  authService.requirePermission(actor, permission);
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const correlationId =
    (req.headers["x-correlation-id"] as string) ?? generateCorrelationId();
  const ctx: RequestContext = { correlationId, actor: null };

  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const path = url.pathname;

    if (path === "/health") {
      json(res, 200, {
        status: "ok",
        service: "api",
        data_mode: dataMode,
      });
      return;
    }

    if (path === "/health/fireblocks" && req.method === "GET") {
      const health = await dataService
        .getConnectionVerification()
        .getHealth({ correlationId, actorId: "system" });
      const statusCode = health.status === "ok" ? 200 : health.status === "degraded" ? 503 : 503;
      json(res, statusCode, health);
      return;
    }

    if (path === "/v1/data-mode" && req.method === "GET") {
      json(res, 200, {
        mode: dataService.getMode(),
        demo_mode: config.DEMO_MODE,
        real_fireblocks: config.REAL_FIREBLOCKS,
        hybrid_mode: config.HYBRID_MODE,
        sandbox: config.FIREBLOCKS_BASE_PATH.includes("sandbox"),
      });
      return;
    }

    if (path === "/v1/system/status" && req.method === "GET") {
      const status = await buildSystemIntegrationStatus(
        config,
        dataService,
        correlationId,
      );
      const allCritical =
        status.fireblocks.connected &&
        status.data_mode === "real" &&
        !status.demo_mode;
      json(res, allCritical ? 200 : 503, status);
      return;
    }

    ctx.actor = authenticate(req);

    await auditLogger.record({
      correlationId,
      eventType: "user_action",
      actorId: ctx.actor.id,
      action: `${req.method} ${path}`,
      outcome: "success",
      metadata: { path },
    });

    if (path === "/v1/fireblocks/connection-status" && req.method === "GET") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      const status = await dataService.checkConnection(fbCtx(ctx));
      await auditLogger.record({
        correlationId,
        eventType: "connection_verification",
        actorId: ctx.actor.id,
        outcome: status.connected ? "success" : "failure",
        metadata: {
          connected: status.connected,
          sandbox_mode: status.sandbox_mode,
          credential_checks: status.credential_checks,
        },
      });
      json(res, status.connected ? 200 : 503, { status });
      return;
    }

    if (path === "/v1/treasury/analyze" && req.method === "POST") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      const body = JSON.parse(await readBody(req));
      const { question } = TreasuryAnalysisRequestSchema.parse(body);
      const investigation = await delayedPaymentsWorkflow.investigate(
        question,
        ctx.actor,
        fbCtx(ctx),
        true,
      );
      json(res, 200, investigation);
      return;
    }

    if (path === "/v1/workflows/delayed-payments/investigate" && req.method === "POST") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      const body = JSON.parse(await readBody(req));
      const { question } = DelayedPaymentsInvestigationRequestSchema.parse(body);
      const investigation = await delayedPaymentsWorkflow.investigate(
        question,
        ctx.actor,
        fbCtx(ctx),
        true,
      );
      json(res, 200, investigation);
      return;
    }

    if (path === "/v1/workflows/delayed-payments/escalation-summary" && req.method === "POST") {
      await requirePermission(ctx.actor, "operations:write", correlationId);
      const body = JSON.parse(await readBody(req));
      const parsed = EscalationSummaryRequestSchema.parse(body);
      const summary = await delayedPaymentsWorkflow.prepareEscalationSummary(
        parsed.correlation_id,
        ctx.actor,
        parsed.investigation_summary,
      );
      json(res, 200, summary);
      return;
    }

    if (path === "/v1/ai/ask" && req.method === "POST") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      const body = JSON.parse(await readBody(req));
      const { question, workflow } = AiAskRequestSchema.parse(body);
      const answer = await evidencePipeline.ask(
        question,
        {
          correlationId,
          actor: ctx.actor,
          fireblocksCtx: fbCtx(ctx),
          permission: "operations:read",
          rbacAllowed: true,
        },
        workflow,
      );
      json(res, 200, answer);
      return;
    }

    if (path === "/v1/trust/status" && req.method === "GET") {
      await requirePermission(ctx.actor, "audit:read", correlationId);
      json(res, 200, buildTrustCenterStatus(config, dataService, correlationId));
      return;
    }

    if (path === "/v1/vault-accounts" && req.method === "GET") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      json(res, 200, wrapResponse(await dataService.listVaultAccounts(fbCtx(ctx))));
      return;
    }

    if (path.match(/^\/v1\/vault-accounts\/[^/]+$/) && req.method === "GET") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      const id = path.split("/").pop()!;
      const result = await dataService.getVaultAccount(id, fbCtx(ctx));
      json(res, result.available ? 200 : 503, wrapResponse(result));
      return;
    }

    if (path === "/v1/wallets" && req.method === "GET") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      json(res, 200, wrapResponse(await dataService.listExternalWallets(fbCtx(ctx))));
      return;
    }

    if (path === "/v1/balances" && req.method === "GET") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      json(res, 200, wrapResponse(await dataService.listBalances(fbCtx(ctx))));
      return;
    }

    if (path === "/v1/transactions" && req.method === "GET") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      json(res, 200, wrapResponse(await dataService.listTransactions(fbCtx(ctx))));
      return;
    }

    if (path.match(/^\/v1\/transactions\/[^/]+$/) && req.method === "GET") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      const id = path.split("/").pop()!;
      const result = await dataService.getTransaction(id, fbCtx(ctx));
      json(res, result.available ? 200 : 503, wrapResponse(result));
      return;
    }

    if (path === "/v1/transactions/draft" && req.method === "POST") {
      await requirePermission(ctx.actor, "operations:write", correlationId);
      const body = JSON.parse(await readBody(req)) as Record<string, string>;
      json(res, 200, wrapResponse(dataService.prepareTransactionDraft(
        {
          assetId: body.assetId,
          amount: body.amount,
          sourceVaultId: body.sourceVaultId,
          destinationVaultId: body.destinationVaultId,
          note: body.note,
        },
        fbCtx(ctx),
      )));
      return;
    }

    if (path === "/v1/policies" && req.method === "GET") {
      await requirePermission(ctx.actor, "policies:read", correlationId);
      json(res, 200, wrapResponse(await dataService.getActivePolicy(fbCtx(ctx))));
      return;
    }

    if (path === "/v1/approvals" && req.method === "GET") {
      await requirePermission(ctx.actor, "approvals:read", correlationId);
      json(res, 200, wrapResponse(await dataService.listApprovals(fbCtx(ctx))));
      return;
    }

    if (path === "/v1/webhooks/events" && req.method === "GET") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      const webhookId = url.searchParams.get("webhookId") ?? config.FIREBLOCKS_WEBHOOK_ID;
      json(res, 200, wrapResponse(await dataService.listWebhookEvents(webhookId ?? undefined, fbCtx(ctx))));
      return;
    }

    if (path === "/v1/counterparties" && req.method === "GET") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      json(res, 200, wrapResponse(await dataService.listCounterparties(fbCtx(ctx))));
      return;
    }

    if (path === "/v1/activity-logs" && req.method === "GET") {
      await requirePermission(ctx.actor, "audit:read", correlationId);
      json(res, 200, wrapResponse(await dataService.listActivityLogs(fbCtx(ctx))));
      return;
    }

    if (path === "/v1/evidence" && req.method === "GET") {
      await requirePermission(ctx.actor, "audit:read", correlationId);
      const fctx = fbCtx(ctx);
      const [vaults, txs, policy, activity, approvals, balances] = await Promise.all([
        dataService.listVaultAccounts(fctx),
        dataService.listTransactions(fctx),
        dataService.getActivePolicy(fctx),
        dataService.listActivityLogs(fctx),
        dataService.listApprovals(fctx),
        dataService.listBalances(fctx),
      ]);

      const items = [
        dataService.toEvidence("Vault Accounts", vaults, "ev-vaults"),
        dataService.toEvidence("Transactions", txs, "ev-txs"),
        dataService.toEvidence("Approval Queue", approvals, "ev-approvals"),
        dataService.toEvidence("Balances", balances, "ev-balances"),
        dataService.toEvidence("Active Policy", policy, "ev-policy"),
        dataService.toEvidence("Activity Logs", activity, "ev-activity"),
      ];

      for (const item of items) {
        await auditLogger.record({
          correlationId,
          eventType: "evidence_retrieved",
          actorId: ctx.actor.id,
          resourceType: item.label,
          outcome: item.available ? "success" : "failure",
          metadata: { evidenceId: item.id, source_type: item.provenance.source_type },
        });
      }

      json(res, 200, {
        mode: dataService.getMode(),
        items,
        ai_eligible_sources: dataService.getMode() === "real" ? ["REAL_FIREBLOCKS"] : [],
      });
      return;
    }

    if (path === "/v1/audit" && req.method === "GET") {
      await requirePermission(ctx.actor, "audit:read", correlationId);
      const events = await auditLogger.query({
        correlationId: url.searchParams.get("correlationId") ?? undefined,
        limit: Number(url.searchParams.get("limit") ?? 100),
      });
      json(res, 200, {
        events,
        provenance: {
          source_type: "CUSTOMER_SYSTEM",
          fetched_at: new Date().toISOString(),
          api_endpoint: "GET /v1/audit",
          mocked_fields: [],
        },
      });
      return;
    }

    json(res, 404, errorBody("NOT_FOUND", "Route not found", correlationId));
  } catch (error) {
    handleError(res, error, ctx.correlationId);
  }
}

function wrapResponse<T>(record: ProvenanceRecord<T>) {
  return { ...record, data_mode: dataService.getMode() };
}

function authenticate(req: IncomingMessage): Actor {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) throw new AuthError("UNAUTHORIZED", "Missing bearer token");

  if (config.NODE_ENV !== "production" && token === "dev-token") {
    return {
      id: "00000000-0000-4000-8000-000000000001",
      type: "human",
      name: "Dev Operator",
      roles: ["admin"],
    };
  }

  const actor = authService.verifyToken(token);
  return actor;
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origins = getCorsOrigins(config);
  const origin = req.headers.origin;
  if (origin && origins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Correlation-Id");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function errorBody(code: string, error: string, correlationId: string) {
  return { error, code, correlationId };
}

function handleError(res: ServerResponse, error: unknown, correlationId: string): void {
  if (error instanceof AuthError) {
    const status = error.code === "FORBIDDEN" ? 403 : 401;
    json(res, status, errorBody(error.code, error.message, correlationId));
    return;
  }

  logger.error("Unhandled error", {
    correlationId,
    error: error instanceof Error ? error.message : String(error),
  });

  json(res, 500, errorBody("INTERNAL_ERROR", "Internal server error", correlationId));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => handleError(res, err, generateCorrelationId()));
});

server.listen(config.API_PORT, config.API_HOST, async () => {
  logger.info("API gateway started", {
    host: config.API_HOST,
    port: config.API_PORT,
    dataMode,
    fireblocksBase: config.FIREBLOCKS_BASE_PATH,
    transactionExecution: "disabled",
  });

  if (config.REAL_FIREBLOCKS && !config.DEMO_MODE) {
    const health = await dataService
      .getConnectionVerification()
      .getHealth({ correlationId: generateCorrelationId(), actorId: "system" });
    if (health.status === "ok") {
      logger.info("Fireblocks sandbox connected", {
        latencyMs: health.api_latency_ms,
        sandbox: health.sandbox_mode,
      });
    } else {
      logger.error("Fireblocks sandbox connection failed at startup", {
        error: health.error,
        checks: health.credential_checks,
      });
    }
  }
});
