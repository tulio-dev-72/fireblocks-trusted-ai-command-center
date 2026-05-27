import { randomUUID } from "node:crypto";
import type { AuditEvent, AuditEventType } from "@taicc/shared-types";

export interface AuditStore {
  append(event: AuditEvent): Promise<void>;
  query(filters: AuditQueryFilters): Promise<AuditEvent[]>;
}

export interface AuditQueryFilters {
  correlationId?: string;
  actorId?: string;
  eventType?: AuditEventType;
  from?: string;
  to?: string;
  limit?: number;
}

export interface RecordAuditInput {
  correlationId: string;
  eventType: AuditEventType;
  actorId?: string;
  resourceType?: string;
  action?: string;
  outcome: AuditEvent["outcome"];
  metadata?: Record<string, unknown>;
}

export class AuditLogger {
  constructor(private readonly store: AuditStore) {}

  async record(input: RecordAuditInput): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: randomUUID(),
      correlationId: input.correlationId,
      eventType: input.eventType,
      actorId: input.actorId,
      resourceType: input.resourceType,
      action: input.action,
      outcome: input.outcome,
      metadata: sanitizeMetadata(input.metadata ?? {}),
      timestamp: new Date().toISOString(),
    };

    await this.store.append(event);
    return event;
  }

  async query(filters: AuditQueryFilters): Promise<AuditEvent[]> {
    return this.store.query(filters);
  }
}

/** In-memory store for development; production uses Postgres append-only table. */
export class InMemoryAuditStore implements AuditStore {
  private events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.events.push(Object.freeze({ ...event }));
  }

  async query(filters: AuditQueryFilters): Promise<AuditEvent[]> {
    let results = [...this.events];

    if (filters.correlationId) {
      results = results.filter(
        (e) => e.correlationId === filters.correlationId,
      );
    }
    if (filters.actorId) {
      results = results.filter((e) => e.actorId === filters.actorId);
    }
    if (filters.eventType) {
      results = results.filter((e) => e.eventType === filters.eventType);
    }
    if (filters.from) {
      results = results.filter((e) => e.timestamp >= filters.from!);
    }
    if (filters.to) {
      results = results.filter((e) => e.timestamp <= filters.to!);
    }

    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const limit = filters.limit ?? 100;
    return results.slice(0, limit);
  }
}

const SENSITIVE_KEYS = [
  "password",
  "secret",
  "token",
  "apiKey",
  "privateKey",
  "authorization",
];

function sanitizeMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export const AUDIT_DDL = `
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  correlation_id UUID NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  actor_id UUID,
  resource_type VARCHAR(128),
  action VARCHAR(128),
  outcome VARCHAR(16) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp);

-- Append-only: revoke UPDATE/DELETE from application role
-- GRANT INSERT, SELECT ON audit_events TO taicc_app;
`;
