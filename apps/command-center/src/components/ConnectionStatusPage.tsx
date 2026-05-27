import { useEffect, useState } from "react";
import type { FireblocksConnectionStatus, CredentialCheck } from "@taicc/shared-types";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { apiGet, API_URL } from "../lib/api";

export function ConnectionStatusPage() {
  const [status, setStatus] = useState<FireblocksConnectionStatus | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statusData, healthRes] = await Promise.all([
          apiGet<{ status: FireblocksConnectionStatus }>("/v1/fireblocks/connection-status"),
          fetch(`${API_URL}/health/fireblocks`),
        ]);
        setStatus(statusData.status);
        if (healthRes.ok) setHealth(await healthRes.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p className="loading">Verifying Fireblocks sandbox connection…</p>;

  return (
    <div className="connection-page">
      {!status?.connected && (
        <div className="error-banner">
          {status?.error ?? error ?? "Fireblocks connection failed — check credentials below"}
        </div>
      )}

      <section className="panel">
        <h2>Connection State</h2>
        <div className="connection-grid">
          <StatusRow label="Connected" value={status?.connected ? "Yes" : "No"} ok={status?.connected} />
          <StatusRow label="Sandbox Mode" value={status?.sandbox_mode ? "Yes" : "No"} ok={status?.sandbox_mode} />
          <StatusRow label="Data Mode" value={status?.mode ?? "—"} />
          <StatusRow label="API Latency" value={status?.api_latency_ms != null ? `${status.api_latency_ms}ms` : "—"} mono />
          <StatusRow label="Authenticated Workspace" value={status?.authenticated_workspace ?? status?.workspace_id ?? "—"} />
          <StatusRow label="Base Path" value={status?.base_path ?? "—"} mono />
          <StatusRow label="Last Checked" value={status ? new Date(status.last_checked_at).toLocaleString() : "—"} />
          <StatusRow label="Last Successful Call" value={status?.last_successful_call_at ? new Date(status.last_successful_call_at).toLocaleString() : "—"} />
        </div>
        {health && (
          <p className="provenance-note">
            Health endpoint: {(health as { message?: string }).message ?? (health as { status?: string }).status}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Credential Validation</h2>
        {!status?.credential_checks?.length ? (
          <p className="empty">No credential checks available</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {status.credential_checks.map((c: CredentialCheck) => (
                <tr key={c.check}>
                  <td className="mono">{c.check}</td>
                  <td className={c.valid ? "status-ok" : "status-fail"}>{c.valid ? "Valid" : "Invalid"}</td>
                  <td>{c.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Accessible Endpoints</h2>
        <div className="endpoint-lists">
          <div>
            <h3>Reachable</h3>
            {status?.endpoint_probes?.filter((p) => p.available).length ? (
              <table className="table">
                <thead>
                  <tr><th>Endpoint</th><th>Latency</th><th>Source</th></tr>
                </thead>
                <tbody>
                  {status.endpoint_probes.filter((p) => p.available).map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className="mono">{p.latency_ms}ms</td>
                      <td><ProvenanceBadge provenance={{ source_type: "REAL_FIREBLOCKS", fetched_at: status.last_checked_at, mocked_fields: [] }} compact /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty">None — connection failure</p>
            )}
          </div>
          <div>
            <h3>Unreachable</h3>
            {status?.endpoint_probes?.filter((p) => !p.available).length ? (
              <ul className="endpoint-list">
                {status.endpoint_probes.filter((p) => !p.available).map((p) => (
                  <li key={p.name} className="endpoint-fail">
                    {p.name}: {p.error ?? "unavailable"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">None</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusRow({
  label,
  value,
  ok,
  mono,
}: {
  label: string;
  value: string;
  ok?: boolean;
  mono?: boolean;
}) {
  let cls = "";
  if (ok === true) cls = "status-ok";
  if (ok === false) cls = "status-fail";

  return (
    <div className="status-row">
      <span className="status-label">{label}</span>
      <span className={`status-value ${cls} ${mono ? "mono" : ""}`}>{value}</span>
    </div>
  );
}
