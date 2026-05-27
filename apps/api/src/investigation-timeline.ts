import type { AuditLogger, EvidenceStore, InvestigationStoreLike } from "@taicc/audit";
import type { AuditTimelineEvent } from "@taicc/shared-types";
import { formatAuditTimelineEvent } from "./investigation-runner.js";

export interface InvestigationTimelineResult {
  correlation_id: string;
  events: AuditTimelineEvent[];
  webhook_event_count: number;
}

export async function buildInvestigationTimeline(
  correlationId: string,
  auditLogger: AuditLogger,
  evidenceStore: EvidenceStore | null,
): Promise<InvestigationTimelineResult> {
  const [auditEvents, webhookEventCount] = await Promise.all([
    auditLogger.query({ correlationId, limit: 200 }),
    evidenceStore?.countOperationalEventsByCorrelation(correlationId) ?? Promise.resolve(0),
  ]);

  const events: AuditTimelineEvent[] = auditEvents.map((event) => {
    const metadata = {
      ...event.metadata,
      ...(event.eventType === "webhook_ingested" && webhookEventCount > 0
        ? { webhook_event_count: webhookEventCount }
        : {}),
    };
    const formatted = formatAuditTimelineEvent({
      id: event.id,
      eventType: event.eventType,
      action: event.action,
      outcome: event.outcome,
      timestamp: event.timestamp,
      metadata,
    });
    return {
      id: event.id,
      event_type: event.eventType,
      action: event.action,
      outcome: event.outcome,
      timestamp: event.timestamp,
      label: formatted.label,
      detail: formatted.detail,
      metadata,
    };
  });

  const hasWebhookAudit = auditEvents.some((e) => e.eventType === "webhook_ingested");
  if (webhookEventCount > 0 && !hasWebhookAudit) {
    events.unshift({
      id: `webhook-summary-${correlationId}`,
      event_type: "webhook_ingested",
      outcome: "success",
      timestamp: new Date().toISOString(),
      label: "Operational webhooks linked",
      detail: `${webhookEventCount} Fireblocks webhook event(s) stored for this correlation`,
      metadata: { webhook_event_count: webhookEventCount, synthetic: true },
    });
  }

  return {
    correlation_id: correlationId,
    events,
    webhook_event_count: webhookEventCount,
  };
}

export interface InvestigationStatusSnapshot {
  correlation_id: string;
  workflow: string;
  mode: string;
  question: string;
  status: string;
  phase?: string;
  started_at: string;
  completed_at?: string;
  error?: string;
  result?: unknown;
  webhook_event_count: number;
}

export async function buildInvestigationStatusSnapshot(
  correlationId: string,
  investigationStore: InvestigationStoreLike,
  evidenceStore: EvidenceStore | null,
): Promise<InvestigationStatusSnapshot | null> {
  const record = await investigationStore.get(correlationId);
  if (!record) return null;

  const webhookEventCount =
    (await evidenceStore?.countOperationalEventsByCorrelation(correlationId)) ?? 0;

  return {
    correlation_id: record.correlation_id,
    workflow: record.workflow,
    mode: record.mode,
    question: record.question,
    status: record.status,
    phase: record.phase,
    started_at: record.started_at,
    completed_at: record.completed_at,
    error: record.error,
    result: record.result,
    webhook_event_count: webhookEventCount,
  };
}
