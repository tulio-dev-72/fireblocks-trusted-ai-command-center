import type { AuditEvent } from "@taicc/shared-types";
import type { AuditQueryFilters, AuditStore } from "./types.js";

/** Test-only fallback — not used in primary runtime paths. */
export class InMemoryAuditStore implements AuditStore {
  private events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.events.push(Object.freeze({ ...event }));
  }

  async query(filters: AuditQueryFilters): Promise<AuditEvent[]> {
    let results = [...this.events];

    if (filters.correlationId) {
      results = results.filter((e) => e.correlationId === filters.correlationId);
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
