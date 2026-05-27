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

export type AuditStoreKind = "postgres" | "memory";

export interface CreateAuditLoggerOptions {
  databaseUrl: string;
  store?: AuditStoreKind;
  bootstrap?: boolean;
}

export interface AuditLoggerHandle {
  logger: import("./logger.js").AuditLogger;
  storeKind: AuditStoreKind;
  shutdown: () => Promise<void>;
}
