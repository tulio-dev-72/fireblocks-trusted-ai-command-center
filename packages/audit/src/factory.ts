import { AuditLogger } from "./logger.js";
import { InMemoryAuditStore } from "./memory-store.js";
import { PostgresAuditStore } from "./postgres-store.js";
import type { AuditLoggerHandle, CreateAuditLoggerOptions } from "./types.js";

export async function createAuditLogger(
  options: CreateAuditLoggerOptions,
): Promise<AuditLoggerHandle> {
  const storeKind = options.store ?? "postgres";
  const bootstrap = options.bootstrap ?? true;

  if (storeKind === "memory") {
    const store = new InMemoryAuditStore();
    return {
      logger: new AuditLogger(store),
      storeKind: "memory",
      shutdown: async () => undefined,
    };
  }

  const postgresStore = await PostgresAuditStore.connect(options.databaseUrl, bootstrap);
  return {
    logger: new AuditLogger(postgresStore),
    storeKind: "postgres",
    shutdown: () => postgresStore.close(),
  };
}

/** Record and query a health-check event to verify append-only persistence. */
export async function verifyAuditPersistence(
  logger: AuditLogger,
  correlationId: string,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const recorded = await logger.record({
      correlationId,
      eventType: "user_action",
      actorId: "00000000-0000-4000-8000-000000000099",
      action: "audit_persistence_check",
      outcome: "success",
      metadata: { check: "append_and_query" },
    });

    const events = await logger.query({ correlationId, limit: 5 });
    const found = events.some((e) => e.id === recorded.id);
    if (!found) {
      return { ok: false, detail: "Recorded audit event not returned by query" };
    }
    return { ok: true, detail: `Append-only audit store verified (event ${recorded.id})` };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
