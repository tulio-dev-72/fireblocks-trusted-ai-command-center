import pg from "pg";
import type { AuditEvent, AuditEventType } from "@taicc/shared-types";
import type { AuditQueryFilters, AuditStore } from "./types.js";
import { AUDIT_IMMUTABILITY_DDL, AUDIT_TABLE_DDL } from "./schema.js";

const SCHEMA_LOCK_ID = 87234901;

const { Pool } = pg;

function poolOptions(databaseUrl: string): pg.PoolConfig {
  const needsSsl =
    databaseUrl.includes("neon.tech") ||
    databaseUrl.includes("sslmode=require") ||
    databaseUrl.includes("sslmode=verify-full");
  return {
    connectionString: databaseUrl,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

export class PostgresAuditStore implements AuditStore {
  constructor(private readonly pool: pg.Pool) {}

  static async connect(databaseUrl: string, bootstrap = true): Promise<PostgresAuditStore> {
    const pool = new Pool(poolOptions(databaseUrl));
    const store = new PostgresAuditStore(pool);
    await store.ping();
    if (bootstrap) {
      await store.ensureSchema();
    }
    return store;
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async ensureSchema(): Promise<void> {
    await this.pool.query("SELECT pg_advisory_lock($1)", [SCHEMA_LOCK_ID]);
    try {
      await this.pool.query(AUDIT_TABLE_DDL);
      await this.pool.query(AUDIT_IMMUTABILITY_DDL);
    } finally {
      await this.pool.query("SELECT pg_advisory_unlock($1)", [SCHEMA_LOCK_ID]);
    }
  }

  async append(event: AuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events (
        id, correlation_id, event_type, actor_id, resource_type, action, outcome, metadata, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        event.id,
        event.correlationId,
        event.eventType,
        event.actorId ?? null,
        event.resourceType ?? null,
        event.action ?? null,
        event.outcome,
        JSON.stringify(event.metadata),
        event.timestamp,
      ],
    );
  }

  async query(filters: AuditQueryFilters): Promise<AuditEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.correlationId) {
      conditions.push(`correlation_id = $${paramIndex++}`);
      params.push(filters.correlationId);
    }
    if (filters.actorId) {
      conditions.push(`actor_id = $${paramIndex++}`);
      params.push(filters.actorId);
    }
    if (filters.eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(filters.eventType);
    }
    if (filters.from) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(filters.from);
    }
    if (filters.to) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(filters.to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters.limit ?? 100;
    params.push(limit);

    const result = await this.pool.query(
      `SELECT id, correlation_id, event_type, actor_id, resource_type, action, outcome, metadata, timestamp
       FROM audit_events
       ${where}
       ORDER BY timestamp DESC
       LIMIT $${paramIndex}`,
      params,
    );

    return result.rows.map(rowToEvent);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function rowToEvent(row: pg.QueryResultRow): AuditEvent {
  const metadata =
    typeof row.metadata === "string"
      ? (JSON.parse(row.metadata) as Record<string, unknown>)
      : ((row.metadata as Record<string, unknown>) ?? {});

  return {
    id: String(row.id),
    correlationId: String(row.correlation_id),
    eventType: row.event_type as AuditEventType,
    actorId: row.actor_id ? String(row.actor_id) : undefined,
    resourceType: row.resource_type ? String(row.resource_type) : undefined,
    action: row.action ? String(row.action) : undefined,
    outcome: row.outcome as AuditEvent["outcome"],
    metadata,
    timestamp: new Date(row.timestamp as string | Date).toISOString(),
  };
}
