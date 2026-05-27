import { useEffect, useState } from "react";
import type { AuditEvent } from "@taicc/shared-types";
import { apiGet } from "../lib/api";

export function AuditLogPage({ correlationFilter }: { correlationFilter?: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState(correlationFilter ?? "");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const qs = filter ? `?correlationId=${encodeURIComponent(filter)}&limit=100` : "?limit=100";
        const data = await apiGet<{ events: AuditEvent[] }>(`/v1/audit${qs}`);
        setEvents(data.events);
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filter]);

  return (
    <div className="audit-page">
      <section className="panel">
        <div className="panel-header">
          <h2>Immutable Audit Trail</h2>
          <span className="meta-chip">Append-only</span>
        </div>
        <p className="panel-desc">
          Every AI prompt, evidence retrieval, RBAC check, workflow execution, and escalation
          preparation is recorded with correlation IDs.
        </p>
        <div className="audit-filter">
          <input
            type="text"
            placeholder="Filter by correlation ID…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="treasury-question-input"
          />
        </div>
      </section>

      <section className="panel">
        {loading ? (
          <p className="loading">Loading audit events…</p>
        ) : events.length === 0 ? (
          <p className="empty">No audit events found.</p>
        ) : (
          <div className="audit-timeline">
            {events.map((event) => (
              <div key={event.id} className={`audit-event outcome-${event.outcome}`}>
                <div className="audit-event-header">
                  <span className="audit-type">{event.eventType}</span>
                  <time>{new Date(event.timestamp).toLocaleString()}</time>
                </div>
                <p className="audit-action">
                  {event.action ?? event.resourceType ?? "—"}
                  <span className={`outcome-badge ${event.outcome}`}>{event.outcome}</span>
                </p>
                <p className="mono audit-correlation">{event.correlationId}</p>
                {Object.keys(event.metadata).length > 0 && (
                  <pre className="audit-meta">{JSON.stringify(event.metadata, null, 2)}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
