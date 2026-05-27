import { randomUUID } from "node:crypto";
import type { AuditEvent } from "@taicc/shared-types";
import type { AuditQueryFilters, AuditStore, RecordAuditInput } from "./types.js";

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

const SENSITIVE_KEYS = [
  "password",
  "secret",
  "token",
  "apiKey",
  "privateKey",
  "authorization",
];

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
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
