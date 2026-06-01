import { useEffect, useState } from "react";
import {
  getAnalyticsIntegrationStatus,
  getLocalEventLog,
  TRACKED_EVENTS,
  type LocalAnalyticsEvent,
} from "../lib/analytics";
import { BUILD_INFO } from "../lib/build-info";

export function UsageAnalyticsPage() {
  const [events, setEvents] = useState<LocalAnalyticsEvent[]>([]);
  const integration = getAnalyticsIntegrationStatus();

  useEffect(() => {
    setEvents(getLocalEventLog());
  }, []);

  return (
    <div className="usage-page">
      <section className="panel">
        <span className="section-eyebrow">Observability</span>
        <h2>Observability</h2>
        <p className="panel-desc">
          Instrumentation for the app itself — not Fireblocks treasury data. Web vitals and product
          events are collected via the analytics provider (Vercel). This page shows integration
          status, deployment build info, and a privacy-safe session log — no API keys, secrets, or
          transaction payloads are ever sent.
        </p>
      </section>

      <section className="panel">
        <h2>Integration Status</h2>
        <div className="usage-status-grid">
          <StatusCard
            title="Vercel Web Analytics"
            packageName={integration.webAnalytics.package}
            active={integration.webAnalytics.clientConfigured}
            note={integration.webAnalytics.note}
          />
          <StatusCard
            title="Vercel Speed Insights"
            packageName={integration.speedInsights.package}
            active={integration.speedInsights.clientConfigured}
            note={integration.speedInsights.note}
          />
        </div>
      </section>

      <section className="panel">
        <h2>Deployment</h2>
        <div className="connection-grid">
          <StatusRow label="Environment" value={BUILD_INFO.vercelEnv} />
          <StatusRow label="Build mode" value={BUILD_INFO.mode} />
          <StatusRow label="App version" value={BUILD_INFO.version} mono />
          <StatusRow label="Git commit" value={BUILD_INFO.gitSha} mono />
          <StatusRow label="Last build" value={formatTimestamp(BUILD_INFO.buildTime)} />
          <StatusRow label="Host" value={typeof window !== "undefined" ? window.location.hostname : "—"} mono />
        </div>
      </section>

      <section className="panel">
        <h2>Tracked Product Events</h2>
        <p className="panel-desc">
          Custom events sent to Vercel Analytics in production. Only safe metadata is included.
        </p>
        <ul className="usage-event-list">
          {TRACKED_EVENTS.map((event) => (
            <li key={event} className="mono">
              {event}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Session Event Log</h2>
        <p className="panel-desc">
          Recent events from this browser session (stored in sessionStorage for operator visibility).
        </p>
        {!events.length ? (
          <p className="empty">No events recorded in this session yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {events.map((entry, index) => (
                <tr key={`${entry.event}-${entry.timestamp}-${index}`}>
                  <td className="mono">{formatTimestamp(entry.timestamp)}</td>
                  <td className="mono">{entry.event}</td>
                  <td className="mono">{formatMetadata(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function StatusCard({
  title,
  packageName,
  active,
  note,
}: {
  title: string;
  packageName: string;
  active: boolean;
  note: string;
}) {
  return (
    <div className="usage-status-card">
      <div className="usage-status-header">
        <h3>{title}</h3>
        <span className={`usage-pill ${active ? "ok" : "warn"}`}>
          {active ? "Client mounted" : "Not configured"}
        </span>
      </div>
      <p className="mono usage-package">{packageName}</p>
      <p className="usage-note">{note}</p>
    </div>
  );
}

function StatusRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="status-row">
      <span className="status-label">{label}</span>
      <span className={`status-value ${mono ? "mono" : ""}`}>{value}</span>
    </div>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatMetadata(entry: LocalAnalyticsEvent) {
  const { event: _event, timestamp: _timestamp, ...rest } = entry;
  const keys = Object.keys(rest);
  if (!keys.length) return "—";
  return keys.map((key) => `${key}=${String(rest[key as keyof typeof rest])}`).join(", ");
}
