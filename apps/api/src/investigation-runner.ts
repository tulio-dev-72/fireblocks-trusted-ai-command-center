import type { AuditLogger, InvestigationStoreLike } from "@taicc/audit";
import type { Actor, InvestigationMode, StartInvestigationResponse } from "@taicc/shared-types";
import { generateCorrelationId } from "@taicc/observability";

export interface InvestigationRunnerDeps {
  store: InvestigationStoreLike;
  auditLogger: AuditLogger;
  delayedPaymentsWorkflow: ReturnType<
    typeof import("@taicc/trusted-ai").createDelayedPaymentsWorkflow
  >;
}

export class InvestigationRunner {
  constructor(private readonly deps: InvestigationRunnerDeps) {}

  async startDelayedPayments(
    question: string,
    mode: InvestigationMode,
    actor: Actor,
  ): Promise<StartInvestigationResponse> {
    const correlationId = generateCorrelationId();
    const startedAt = new Date().toISOString();

    await this.deps.store.create({
      correlationId,
      workflow: "delayed_payments_investigator",
      mode,
      question,
      actorId: actor.id,
    });

    await this.deps.auditLogger.record({
      correlationId,
      eventType: "workflow_executed",
      actorId: actor.id,
      action: "investigation_started",
      outcome: "success",
      metadata: {
        workflow: "delayed_payments_investigator",
        mode,
        question,
        async: true,
        phase: "queued",
      },
    });

    void this.runDelayedPayments(correlationId, question, mode, actor);

    return {
      correlation_id: correlationId,
      status: "running",
      workflow: "delayed_payments_investigator",
      mode,
      question,
      started_at: startedAt,
      poll: {
        status: `/v1/investigations/${correlationId}`,
        events: `/v1/investigations/${correlationId}/timeline`,
        stream: `/v1/investigations/${correlationId}/stream`,
      },
    };
  }

  private async runDelayedPayments(
    correlationId: string,
    question: string,
    mode: InvestigationMode,
    actor: Actor,
  ): Promise<void> {
    try {
      await this.deps.store.setPhase(correlationId, "retrieving_evidence");

      const result = await this.deps.delayedPaymentsWorkflow.investigate(
        question,
        actor,
        { correlationId, actorId: actor.id },
        true,
        mode,
      );

      await this.deps.store.complete(correlationId, result);

      await this.deps.auditLogger.record({
        correlationId,
        eventType: "workflow_executed",
        actorId: actor.id,
        action: "investigation_completed",
        outcome: "success",
        metadata: { mode, async: true, phase: "complete" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.deps.store.fail(correlationId, message);
      await this.deps.auditLogger.record({
        correlationId,
        eventType: "error",
        actorId: actor.id,
        action: "investigation_failed",
        outcome: "failure",
        metadata: { error: message, mode, async: true },
      });
    }
  }
}

export function createInvestigationRunner(deps: InvestigationRunnerDeps): InvestigationRunner {
  return new InvestigationRunner(deps);
}

/** Map raw audit events to timeline labels for the investigation workspace UI */
export function formatAuditTimelineEvent(event: {
  id: string;
  eventType: string;
  action?: string;
  outcome: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}): { label: string; detail?: string } {
  switch (event.eventType) {
    case "evidence_retrieved":
      return {
        label: "Evidence retrieved",
        detail: String(event.metadata?.evidenceId ?? event.action ?? "Fireblocks record"),
      };
    case "ai_prompt":
      return { label: "AI operational analysis initiated", detail: "Evidence synthesis" };
    case "ai_response":
      return { label: "AI analysis complete", detail: "Institutional assessment generated" };
    case "policy_evaluation":
      return {
        label: "Policy evaluation",
        detail: String(event.metadata?.reason ?? "Request authorized"),
      };
    case "rbac_filter":
      return { label: "RBAC authorization", detail: String(event.action ?? "Permission check") };
    case "workflow_executed":
      return {
        label: event.action === "investigation_started"
          ? "Investigation started"
          : event.action === "investigation_completed"
            ? "Investigation completed"
            : "Workflow step",
        detail: String(event.metadata?.phase ?? event.action ?? ""),
      };
    case "webhook_ingested":
      return {
        label: "Webhook ingested",
        detail: event.metadata?.webhook_event_count
          ? `${event.metadata.webhook_event_count} operational webhook event(s) for this investigation`
          : String(event.metadata?.eventType ?? "Fireblocks webhook"),
      };
    case "fireblocks_api_call":
      return { label: "Fireblocks API call", detail: String(event.action ?? "") };
    case "user_action":
      return { label: "Operator action", detail: String(event.action ?? "") };
    default:
      return { label: event.eventType.replace(/_/g, " "), detail: event.action };
  }
}
