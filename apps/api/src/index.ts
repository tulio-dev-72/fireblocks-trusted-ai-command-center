import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig, getCorsOrigins, resolveDataMode, buildFireblocksClientOptions } from "@taicc/config";
import { AuthService, extractBearerToken, AuthError, type Permission } from "@taicc/auth";
import { AuditLogger, createAuditLogger, EvidenceStore, InvestigationStore, InMemoryInvestigationStore, type InvestigationStoreLike } from "@taicc/audit";
import {
  evaluateRequestPolicy,
  initPolicyEngine,
  isSandboxAdminWritePath,
  PolicyDeniedError,
} from "./policy-guard.js";
import { tryHandleEnterpriseRoute } from "./enterprise-routes.js";
import { createOperationalQueue, type QueueHandle } from "@taicc/queue";
import {
  createFireblocksClient,
  runFireblocksAuthDiagnostics,
  createSandboxActivityGenerator,
  assertSandboxBasePath,
  type SandboxActivityGenerator,
} from "@taicc/fireblocks-client";
import { createDataService } from "@taicc/data-layer";
import {
  createEvidencePipeline,
  createDelayedPaymentsWorkflow,
  buildTrustCenterStatus,
  buildSystemIntegrationStatus,
  buildSandboxDataReadiness,
} from "@taicc/trusted-ai";
import { createLogger, generateCorrelationId } from "@taicc/observability";
import type { Actor, ProvenanceRecord } from "@taicc/shared-types";
import { SYSTEM_ACTOR_ID } from "@taicc/shared-types";
import {
  TreasuryAnalysisRequestSchema,
  AiAskRequestSchema,
  DelayedPaymentsInvestigationRequestSchema,
  EscalationSummaryRequestSchema,
  SandboxActivityRequestSchema,
  StartInvestigationRequestSchema,
} from "@taicc/shared-types";
import { isDisabledExecutionRoute, EXECUTION_DISABLED_MESSAGE } from "./execution-boundary.js";
import {
  createInvestigationRunner,
  type InvestigationRunner,
} from "./investigation-runner.js";
import { buildInvestigationStatusSnapshot, buildInvestigationTimeline } from "./investigation-timeline.js";
import { streamInvestigation } from "./investigation-stream.js";

const SANDBOX_ADMIN_ACTOR: Actor = {
  id: "00000000-0000-4000-8000-000000000004",
  type: "human",
  name: "Sandbox Activity Admin",
  roles: ["admin"],
};

const PLATFORM_VIEWER_ACTOR: Actor = {
  id: "00000000-0000-4000-8000-000000000003",
  type: "human",
  name: "Platform Viewer",
  roles: ["viewer"],
};

async function buildFireblocksAuthDiagnosticsResponse(
  appBearerHint?: string | null,
) {
  const diagnostics = await runFireblocksAuthDiagnostics(
    buildFireblocksClientOptions(config),
    logger,
  );

  if (appBearerHint !== undefined) {
    diagnostics.app_api_auth = classifyAppBearer(appBearerHint);
  }

  return diagnostics;
}

function classifyAppBearer(token: string | null): NonNullable<
  import("@taicc/shared-types").FireblocksAuthDiagnostics["app_api_auth"]
> {
  if (!token?.trim()) {
    return {
      bearer_configured: false,
      bearer_format: "missing",
      note:
        "No Bearer token sent. Set VITE_API_TOKEN to API_VIEWER_TOKEN (production) or use dev-token locally.",
    };
  }

  const trimmed = token.trim();

  if (config.NODE_ENV !== "production" && trimmed === "dev-token") {
    return {
      bearer_configured: true,
      bearer_format: "dev",
      note: "Development dev-token accepted",
    };
  }

  if (config.API_VIEWER_TOKEN?.trim() && trimmed === config.API_VIEWER_TOKEN.trim()) {
    return {
      bearer_configured: true,
      bearer_format: "viewer_token",
      note: "API_VIEWER_TOKEN matched — read-only platform access",
    };
  }

  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return {
      bearer_configured: true,
      bearer_format: "invalid",
      note:
        "Bearer token is not a valid platform JWT (expected 3 segments). " +
        "This is app API auth, not Fireblocks JWT. Use API_VIEWER_TOKEN or mint a JWT.",
    };
  }

  try {
    authService.verifyToken(trimmed);
    return {
      bearer_configured: true,
      bearer_format: "jwt",
      note: "Valid platform JWT",
    };
  } catch (error) {
    return {
      bearer_configured: true,
      bearer_format: "invalid",
      note: error instanceof AuthError ? error.message : "Invalid platform JWT",
    };
  }
}

const config = loadConfig();
const logger = createLogger("api", config.LOG_LEVEL);
const dataMode = resolveDataMode(config);

const authService = new AuthService({
  jwtSecret: config.JWT_SECRET,
  issuer: config.JWT_ISSUER,
  audience: config.JWT_AUDIENCE,
});

let auditLogger!: AuditLogger;
let auditStoreKind = "postgres";
let dataService!: ReturnType<typeof createDataService>;
let evidencePipeline!: ReturnType<typeof createEvidencePipeline>;
let delayedPaymentsWorkflow!: ReturnType<typeof createDelayedPaymentsWorkflow>;
let sandboxActivityGenerator!: SandboxActivityGenerator;
let evidenceStore: EvidenceStore | null = null;
let investigationStore!: InvestigationStoreLike;
let investigationRunner!: InvestigationRunner;
let jobQueue: QueueHandle | null = null;
let bootstrapped = false;
let shutdownAudit: (() => Promise<void>) | null = null;

async function bootstrap(): Promise<() => Promise<void>> {
  const auditHandle = await createAuditLogger({
    databaseUrl: config.DATABASE_URL,
    store: config.AUDIT_STORE,
    bootstrap: config.AUDIT_BOOTSTRAP_SCHEMA,
  });
  auditLogger = auditHandle.logger;
  auditStoreKind = auditHandle.storeKind;

  initPolicyEngine(config);

  if (auditStoreKind === "postgres") {
    try {
      evidenceStore = await EvidenceStore.connect(config.DATABASE_URL, config.AUDIT_BOOTSTRAP_SCHEMA);
    } catch (error) {
      logger.warn("Evidence store unavailable", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    investigationStore = await InvestigationStore.connect(
      config.DATABASE_URL,
      config.AUDIT_BOOTSTRAP_SCHEMA,
    );
  } else {
    investigationStore = new InMemoryInvestigationStore();
  }

  jobQueue = await createOperationalQueue(config.REDIS_URL);
  if (jobQueue) {
    logger.info("Operational job queue connected", { redisUrl: config.REDIS_URL.replace(/:[^:@/]+@/, ":***@") });
  } else {
    logger.warn("Operational job queue unavailable — investigations run synchronously");
  }

  const fireblocksClient = createFireblocksClient(
    buildFireblocksClientOptions(config),
    auditLogger,
  );

  sandboxActivityGenerator = createSandboxActivityGenerator({
    client: fireblocksClient,
    config: buildFireblocksClientOptions(config),
    auditLogger,
  });

  dataService = createDataService(config, fireblocksClient);
  evidencePipeline = createEvidencePipeline(dataService, auditLogger, config);
  delayedPaymentsWorkflow = createDelayedPaymentsWorkflow(
    dataService,
    auditLogger,
    config,
  );

  investigationRunner = createInvestigationRunner({
    store: investigationStore,
    auditLogger,
    delayedPaymentsWorkflow,
  });

  try {
    dataService.assertReady();
  } catch (error) {
    logger.error("Fireblocks startup validation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (config.NODE_ENV === "production" || (config.REAL_FIREBLOCKS && !config.DEMO_MODE)) {
      throw error;
    }
  }

  logger.info("Audit store initialized", {
    store: auditStoreKind,
    databaseUrl: config.DATABASE_URL.replace(/:[^:@/]+@/, ":***@"),
  });

  return auditHandle.shutdown;
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

    if (isDisabledExecutionRoute(req.method ?? "GET", path)) {
      json(res, 403, errorBody("EXECUTION_DISABLED", EXECUTION_DISABLED_MESSAGE, correlationId));
      return;
    }

    if (path === "/health") {
      json(res, 200, {
        status: bootstrapped ? "ok" : "starting",
        service: "api",
        data_mode: dataMode,
        audit_store: bootstrapped ? auditStoreKind : "initializing",
      });
      return;
    }

    if (!bootstrapped) {
      json(res, 503, {
        status: "starting",
        message: "API is initializing — retry shortly",
        correlationId,
      });
      return;
    }

    if (path === "/health/fireblocks" && req.method === "GET") {
      const health = await dataService
        .getConnectionVerification()
        .getHealth({ correlationId, actorId: SYSTEM_ACTOR_ID });
      const statusCode = health.status === "ok" ? 200 : health.status === "degraded" ? 503 : 503;
      json(res, statusCode, health);
      return;
    }

    if (path === "/health/fireblocks/auth-diagnostics" && req.method === "GET") {
      const appBearer = extractBearerToken(req.headers.authorization);
      const diagnostics = await buildFireblocksAuthDiagnosticsResponse(appBearer);
      const statusCode = diagnostics.auth_test.ok ? 200 : 503;
      json(res, statusCode, diagnostics);
      return;
    }

    if (path === "/v1/app-auth/status" && req.method === "GET") {
      const appBearer = extractBearerToken(req.headers.authorization);
      json(res, 200, classifyAppBearer(appBearer));
      return;
    }

    if (path === "/v1/fireblocks/connection" && req.method === "GET") {
      const health = await dataService
        .getConnectionVerification()
        .getHealth({ correlationId, actorId: SYSTEM_ACTOR_ID });
      const statusCode = health.status === "ok" ? 200 : 503;
      json(res, statusCode, health);
      return;
    }

    if (path === "/health/ready" && req.method === "GET") {
      const checks: Record<string, string> = { api: "ok", audit_store: auditStoreKind };
      let ready = true;

      if (auditStoreKind === "postgres") {
        try {
          await auditLogger.query({ limit: 1 });
          checks.postgres = "ok";
        } catch (error) {
          ready = false;
          checks.postgres = error instanceof Error ? error.message : "unavailable";
        }
      }

      if (config.REAL_FIREBLOCKS && !config.DEMO_MODE) {
        const fbHealth = await dataService
          .getConnectionVerification()
          .getHealth({ correlationId, actorId: SYSTEM_ACTOR_ID });
        checks.fireblocks = fbHealth.status;
        if (fbHealth.status !== "ok") ready = false;
      }

      json(res, ready ? 200 : 503, {
        status: ready ? "ready" : "not_ready",
        checks,
        data_mode: dataMode,
        audit_store: auditStoreKind,
      });
      return;
    }

    if (path === "/v1/status" && req.method === "GET") {
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

    if (!isSandboxAdminWritePath(req.method ?? "GET", path)) {
      await evaluateRequestPolicy({
        actor: ctx.actor,
        method: req.method ?? "GET",
        path,
        correlationId,
        auditLogger,
      });
    }

    if (
      await tryHandleEnterpriseRoute({
        req,
        res,
        path,
        method: req.method ?? "GET",
        correlationId,
        actor: ctx.actor,
        url,
        readBody: () => readBody(req),
        requirePermission,
        json,
        wrapResponse,
        fbCtx: (cid, actorId) => ({ correlationId: cid, actorId }),
        dataService,
        evidencePipeline,
        delayedPaymentsWorkflow,
        auditLogger,
        evidenceStore,
        jobQueue,
      })
    ) {
      return;
    }

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

    if (path === "/v1/fireblocks/auth-diagnostics" && req.method === "GET") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      const appBearer = extractBearerToken(req.headers.authorization);
      const diagnostics = await buildFireblocksAuthDiagnosticsResponse(appBearer);
      await auditLogger.record({
        correlationId,
        eventType: "connection_verification",
        actorId: ctx.actor.id,
        outcome: diagnostics.auth_test.ok ? "success" : "failure",
        metadata: {
          sandbox_connectivity: diagnostics.sandbox_connectivity,
          jwt_ok: diagnostics.jwt_generation.ok,
        },
      });
      json(res, diagnostics.auth_test.ok ? 200 : 503, diagnostics);
      return;
    }

    if (path === "/v1/fireblocks/sandbox-readiness" && req.method === "GET") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      const readiness = await buildSandboxDataReadiness(config, dataService, fbCtx(ctx));
      await auditLogger.record({
        correlationId,
        eventType: "connection_verification",
        actorId: ctx.actor.id,
        outcome: readiness.investigation_ready ? "success" : "failure",
        metadata: {
          investigation_ready: readiness.investigation_ready,
          transaction_count: readiness.metrics.transaction_count,
        },
      });
      json(res, readiness.connected ? 200 : 503, readiness);
      return;
    }

    if (path === "/v1/sandbox/activity/capabilities" && req.method === "GET") {
      ctx.actor = authenticate(req);
      await requirePermission(ctx.actor, "operations:read", correlationId);
      json(res, 200, buildSandboxActivityCapabilities(ctx.actor));
      return;
    }

    if (path === "/v1/sandbox/activity/generate" && req.method === "POST") {
      ctx.actor = authenticateSandboxAdmin(req);
      await requirePermission(ctx.actor, "sandbox:generate", correlationId);

      try {
        assertSandboxBasePath(config.FIREBLOCKS_BASE_PATH);
      } catch (error) {
        json(
          res,
          403,
          errorBody(
            "SANDBOX_ONLY",
            error instanceof Error ? error.message : "Sandbox only",
            correlationId,
          ),
        );
        return;
      }

      const body = JSON.parse(await readBody(req));
      const parsed = SandboxActivityRequestSchema.parse(body);

      logger.info("Sandbox activity generation started", {
        correlationId,
        actorId: ctx.actor.id,
        create_vault: parsed.create_vault,
        has_transfer: Boolean(parsed.transfer),
      });

      const result = await sandboxActivityGenerator.run(parsed, fbCtx(ctx), ctx.actor.id);
      json(res, result.ok ? 200 : 502, result);
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

    if (path === "/v1/investigations/run" && req.method === "POST") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      const body = JSON.parse(await readBody(req));
      const parsed = StartInvestigationRequestSchema.parse(body);

      if (parsed.workflow !== "delayed_payments_investigator") {
        json(res, 400, errorBody("UNSUPPORTED_WORKFLOW", "Workflow not supported", correlationId));
        return;
      }

      const started = await investigationRunner.startDelayedPayments(
        parsed.question,
        parsed.mode,
        ctx.actor,
      );
      json(res, 202, started);
      return;
    }

    const investigationMatch = path.match(/^\/v1\/investigations\/([^/]+)(\/timeline|\/stream)?$/);
    if (investigationMatch && req.method === "GET") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
      const targetId = investigationMatch[1];
      const suffix = investigationMatch[2];

      if (suffix === "/stream") {
        await streamInvestigation(req, res, targetId, {
          investigationStore,
          auditLogger,
          evidenceStore,
        });
        return;
      }

      if (suffix === "/timeline") {
        const timeline = await buildInvestigationTimeline(
          targetId,
          auditLogger,
          evidenceStore,
        );
        json(res, 200, timeline);
        return;
      }

      const snapshot = await buildInvestigationStatusSnapshot(
        targetId,
        investigationStore,
        evidenceStore,
      );
      if (!snapshot) {
        json(res, 404, errorBody("NOT_FOUND", "Investigation not found", correlationId));
        return;
      }

      json(res, 200, snapshot);
      return;
    }

    if (path === "/v1/workflows/delayed-payments/escalation-summary" && req.method === "POST") {
      await requirePermission(ctx.actor, "operations:read", correlationId);
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

      if (evidenceStore) {
        await evidenceStore.persistBundle({
          correlationId,
          sourceType: "REAL_FIREBLOCKS",
          records: items.map((item) => ({
            evidenceId: item.id,
            label: item.label,
            sourceType: item.provenance.source_type,
            available: item.available,
            metadata: {
              provenance: item.provenance,
            },
          })),
        });
        if (jobQueue) {
          await jobQueue.enqueue({
            type: "persist_evidence_bundle",
            correlationId,
            payload: { item_count: items.length },
          });
        }
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
  const raw = extractBearerToken(req.headers.authorization);
  if (!raw?.trim()) throw new AuthError("UNAUTHORIZED", "Missing bearer token");
  const token = raw.trim();

  if (config.NODE_ENV !== "production" && token === "dev-token") {
    return {
      id: "00000000-0000-4000-8000-000000000001",
      type: "human",
      name: "Dev Operator",
      roles: ["admin"],
    };
  }

  if (config.API_VIEWER_TOKEN?.trim() && token === config.API_VIEWER_TOKEN.trim()) {
    return PLATFORM_VIEWER_ACTOR;
  }

  if (config.SANDBOX_ADMIN_TOKEN?.trim() && token === config.SANDBOX_ADMIN_TOKEN.trim()) {
    return SANDBOX_ADMIN_ACTOR;
  }

  return authService.verifyToken(token);
}

function authenticateSandboxAdmin(req: IncomingMessage): Actor {
  const raw = extractBearerToken(req.headers.authorization);
  if (!raw?.trim()) throw new AuthError("UNAUTHORIZED", "Missing bearer token");
  const token = raw.trim();

  if (req.headers["x-taicc-ai-initiated"] === "true") {
    throw new AuthError(
      "FORBIDDEN",
      "Sandbox activity cannot be initiated by AI workflows",
    );
  }

  if (config.NODE_ENV !== "production" && token === "dev-token") {
    return {
      id: "00000000-0000-4000-8000-000000000001",
      type: "human",
      name: "Dev Operator",
      roles: ["admin"],
    };
  }

  if (config.SANDBOX_ADMIN_TOKEN?.trim() && token === config.SANDBOX_ADMIN_TOKEN.trim()) {
    return SANDBOX_ADMIN_ACTOR;
  }

  const actor = authService.verifyToken(token);
  if (actor.type === "agent") {
    throw new AuthError("FORBIDDEN", "Agents cannot generate sandbox activity");
  }
  authService.requirePermission(actor, "sandbox:generate");
  return actor;
}

function buildSandboxActivityCapabilities(actor: Actor) {
  const sandboxOnly = config.FIREBLOCKS_BASE_PATH.includes("sandbox-api.fireblocks.io");
  let canGenerate = false;
  let reason: string | undefined;

  if (!sandboxOnly) {
    reason = "FIREBLOCKS_BASE_PATH is not a Fireblocks sandbox endpoint";
  } else if (actor.type === "agent") {
    reason = "Agents cannot generate sandbox activity";
  } else if (!authService.hasPermission(actor, "sandbox:generate")) {
    reason = "Admin role or SANDBOX_ADMIN_TOKEN required";
  } else {
    canGenerate = true;
  }

  return {
    can_generate: canGenerate,
    sandbox_only: sandboxOnly,
    ai_execution_blocked: true as const,
    reason,
  };
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
  if (error instanceof PolicyDeniedError) {
    json(res, 403, {
      error: error.message,
      code: error.code,
      audit_reference: error.auditReference,
      correlationId,
    });
    return;
  }

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

async function main(): Promise<void> {
  const shutdown = async () => {
    if (shutdownAudit) await shutdownAudit();
  };
  process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });

  await new Promise<void>((resolve) => {
    server.listen(config.API_PORT, config.API_HOST, () => {
      logger.info("API gateway listening", {
        host: config.API_HOST,
        port: config.API_PORT,
        dataMode,
      });
      resolve();
    });
  });

  shutdownAudit = await bootstrap();
  bootstrapped = true;

  logger.info("API gateway started", {
    host: config.API_HOST,
    port: config.API_PORT,
    dataMode,
    auditStore: auditStoreKind,
    fireblocksBase: config.FIREBLOCKS_BASE_PATH,
    transactionExecution: "disabled",
  });

  if (config.REAL_FIREBLOCKS && !config.DEMO_MODE) {
    const health = await dataService
      .getConnectionVerification()
      .getHealth({ correlationId: generateCorrelationId(), actorId: SYSTEM_ACTOR_ID });
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
      if (config.NODE_ENV === "production") {
        process.exit(1);
      }
    }
  }
}

main().catch((error) => {
  logger.error("API failed to start", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
