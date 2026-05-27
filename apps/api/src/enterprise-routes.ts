import type { IncomingMessage, ServerResponse } from "node:http";
import type { Permission } from "@taicc/auth";
import type { AuditLogger, EvidenceStore } from "@taicc/audit";
import type { QueueHandle } from "@taicc/queue";
import {
  PLATFORM_AGENTS,
  AgentInvestigateRequestSchema,
  DelayedPaymentsInvestigationRequestSchema,
  EscalationSummaryRequestSchema,
} from "@taicc/shared-types";
import type { Actor, ProvenanceRecord } from "@taicc/shared-types";
import type { createDataService } from "@taicc/data-layer";
import type {
  createDelayedPaymentsWorkflow,
  createEvidencePipeline,
} from "@taicc/trusted-ai";

type DataService = ReturnType<typeof createDataService>;
type EvidencePipeline = ReturnType<typeof createEvidencePipeline>;
type DelayedPaymentsWorkflow = ReturnType<typeof createDelayedPaymentsWorkflow>;

export interface EnterpriseRouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  path: string;
  method: string;
  correlationId: string;
  actor: Actor;
  url: URL;
  readBody: () => Promise<string>;
  requirePermission: (actor: Actor, permission: Permission, correlationId: string) => Promise<void>;
  json: (res: ServerResponse, status: number, body: unknown) => void;
  wrapResponse: <T>(record: ProvenanceRecord<T>) => unknown;
  fbCtx: (correlationId: string, actorId: string) => { correlationId: string; actorId?: string };
  dataService: DataService;
  evidencePipeline: EvidencePipeline;
  delayedPaymentsWorkflow: DelayedPaymentsWorkflow;
  auditLogger: AuditLogger;
  evidenceStore: EvidenceStore | null;
  jobQueue: QueueHandle | null;
}

export async function tryHandleEnterpriseRoute(
  ctx: EnterpriseRouteContext,
): Promise<boolean> {
  const { path, method, actor, correlationId } = ctx;
  const fctx = ctx.fbCtx(correlationId, actor.id);

  if (path === "/v1/agents" && method === "GET") {
    await ctx.requirePermission(actor, "agents:read", correlationId);
    ctx.json(ctx.res, 200, {
      agents: PLATFORM_AGENTS,
      note: "All registered agents operate under read-only execution boundary.",
    });
    return true;
  }

  if (path === "/v1/fireblocks/vaults" && method === "GET") {
    await ctx.requirePermission(actor, "operations:read", correlationId);
    ctx.json(ctx.res, 200, ctx.wrapResponse(await ctx.dataService.listVaultAccounts(fctx)));
    return true;
  }

  if (path === "/v1/fireblocks/balances" && method === "GET") {
    await ctx.requirePermission(actor, "operations:read", correlationId);
    ctx.json(ctx.res, 200, ctx.wrapResponse(await ctx.dataService.listBalances(fctx)));
    return true;
  }

  if (path === "/v1/fireblocks/transactions" && method === "GET") {
    await ctx.requirePermission(actor, "operations:read", correlationId);
    ctx.json(ctx.res, 200, ctx.wrapResponse(await ctx.dataService.listTransactions(fctx)));
    return true;
  }

  if (path === "/v1/audit/events" && method === "GET") {
    await ctx.requirePermission(actor, "audit:read", correlationId);
    const events = await ctx.auditLogger.query({
      correlationId: ctx.url.searchParams.get("correlationId") ?? undefined,
      limit: Number(ctx.url.searchParams.get("limit") ?? 100),
    });
    ctx.json(ctx.res, 200, { events, count: events.length });
    return true;
  }

  if (path.match(/^\/v1\/evidence\/[^/]+$/) && method === "GET") {
    await ctx.requirePermission(actor, "audit:read", correlationId);
    const evidenceId = path.split("/").pop()!;
    if (ctx.evidenceStore) {
      const record = await ctx.evidenceStore.getById(evidenceId);
      if (record) {
        ctx.json(ctx.res, 200, record);
        return true;
      }
    }
    ctx.json(ctx.res, 404, {
      error: "Evidence record not found",
      evidence_id: evidenceId,
      correlationId,
    });
    return true;
  }

  if (path === "/v1/agents/investigate" && method === "POST") {
    await ctx.requirePermission(actor, "operations:read", correlationId);
    const body = JSON.parse(await ctx.readBody());
    const parsed = AgentInvestigateRequestSchema.parse(body);
    if (ctx.jobQueue) {
      await ctx.jobQueue.enqueue({
        type: "generate_ai_summary",
        correlationId,
        payload: { question: parsed.question, workflow: parsed.workflow },
      });
    }
    const answer = await ctx.evidencePipeline.ask(
      parsed.question,
      {
        correlationId,
        actor,
        fireblocksCtx: fctx,
        permission: "operations:read",
        rbacAllowed: true,
      },
      parsed.workflow,
    );
    ctx.json(ctx.res, 200, answer);
    return true;
  }

  if (path === "/v1/operations/delayed-payments" && method === "POST") {
    await ctx.requirePermission(actor, "operations:read", correlationId);
    const body = JSON.parse(await ctx.readBody());
    const { question } = DelayedPaymentsInvestigationRequestSchema.parse(body);
    if (ctx.jobQueue) {
      await ctx.jobQueue.enqueue({
        type: "run_delayed_payments_investigation",
        correlationId,
        payload: { question },
      });
    }
    const investigation = await ctx.delayedPaymentsWorkflow.investigate(
      question,
      actor,
      fctx,
      true,
    );
    ctx.json(ctx.res, 200, investigation);
    return true;
  }

  if (path === "/v1/operations/escalations/prepare" && method === "POST") {
    await ctx.requirePermission(actor, "operations:read", correlationId);
    const body = JSON.parse(await ctx.readBody());
    const parsed = EscalationSummaryRequestSchema.parse(body);
    if (ctx.jobQueue) {
      await ctx.jobQueue.enqueue({
        type: "prepare_escalation_summary",
        correlationId,
        payload: parsed,
      });
    }
    const summary = await ctx.delayedPaymentsWorkflow.prepareEscalationSummary(
      parsed.correlation_id,
      actor,
      parsed.investigation_summary,
    );
    ctx.json(ctx.res, 200, summary);
    return true;
  }

  if (path === "/v1/webhooks/fireblocks" && method === "POST") {
    await ctx.requirePermission(actor, "operations:write", correlationId);
    const raw = await ctx.readBody();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      payload = { raw };
    }

    const eventType = String(payload.type ?? payload.eventType ?? "unknown");
    const txId = payload.txId ?? payload.transactionId;

    let operationalEventId: string | undefined;
    let webhookEventCount = 0;
    if (ctx.evidenceStore) {
      operationalEventId = await ctx.evidenceStore.ingestOperationalEvent({
        correlationId,
        eventType,
        payload,
        fireblocksTxId: typeof txId === "string" ? txId : undefined,
      });
      webhookEventCount = await ctx.evidenceStore.countOperationalEventsByCorrelation(correlationId);
    }

    if (ctx.jobQueue) {
      await ctx.jobQueue.enqueue({
        type: "process_fireblocks_webhook",
        correlationId,
        payload: { eventType, operationalEventId, payload },
      });
    }

    await ctx.auditLogger.record({
      correlationId,
      eventType: "webhook_ingested",
      actorId: actor.id,
      action: "POST /v1/webhooks/fireblocks",
      outcome: "success",
      metadata: { eventType, operationalEventId, fireblocksTxId: txId, webhook_event_count: webhookEventCount },
    });

    ctx.json(ctx.res, 202, {
      accepted: true,
      correlation_id: correlationId,
      operational_event_id: operationalEventId,
      note: "Webhook stored and queued — no transaction execution triggered.",
    });
    return true;
  }

  return false;
}
