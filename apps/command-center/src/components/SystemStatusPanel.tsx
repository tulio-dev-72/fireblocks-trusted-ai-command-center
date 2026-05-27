import { useEffect, useState } from "react";
import type { SystemIntegrationStatus } from "@taicc/shared-types";
import { API_URL } from "../lib/api";

const STATUS_LABEL: Record<string, string> = {
  connected: "Connected",
  degraded: "Degraded",
  disconnected: "Disconnected",
  active: "Active",
  inactive: "Inactive",
};

interface Props {
  compact?: boolean;
}

export function SystemStatusPanel({ compact = false }: Props) {
  const [status, setStatus] = useState<SystemIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch(`${API_URL}/v1/system/status`);
        const data = (await response.json()) as SystemIntegrationStatus;
        if (active) {
          setStatus(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Status unavailable");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (loading && !status) {
    return (
      <section className="panel system-status-panel">
        <h2>System Status</h2>
        <p className="loading">Loading integration status…</p>
      </section>
    );
  }

  if (error && !status) {
    return (
      <section className="panel system-status-panel">
        <h2>System Status</h2>
        <div className="error-banner">{error}</div>
      </section>
    );
  }

  if (!status) return null;

  const primaryChecks = status.checks.filter((c) =>
    ["fireblocks", "openai", "anthropic"].includes(c.id),
  );
  const governanceChecks = status.checks.filter((c) =>
    ["audit_logging", "rbac", "real_data_mode"].includes(c.id),
  );

  return (
    <section className={`panel system-status-panel ${compact ? "compact" : ""}`}>
      <div className="panel-header">
        <div>
          <h2>System Status</h2>
          <p className="panel-desc">
            Live integration posture — {status.data_mode.toUpperCase()} data mode
            {status.fireblocks.sandbox_mode ? " · Fireblocks sandbox" : ""}
          </p>
        </div>
        <span className="status-timestamp mono">
          {new Date(status.checked_at).toLocaleTimeString()}
        </span>
      </div>

      <div className="system-status-grid">
        <div className="status-group">
          <h3 className="status-group-title">Integrations</h3>
          {primaryChecks.map((check) => (
            <div key={check.id} className={`status-line status-${check.status}`}>
              <span className="status-line-label">{check.label}</span>
              <span className="status-line-value">{STATUS_LABEL[check.status]}</span>
              <span className="status-line-detail">{check.detail}</span>
            </div>
          ))}
        </div>

        <div className="status-group">
          <h3 className="status-group-title">Governance</h3>
          {governanceChecks.map((check) => (
            <div key={check.id} className={`status-line status-${check.status}`}>
              <span className="status-line-label">{check.label}</span>
              <span className="status-line-value">{STATUS_LABEL[check.status]}</span>
              <span className="status-line-detail">{check.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {status.fireblocks.connected && (
        <div className="fireblocks-metrics">
          <span>Vault accounts: {status.fireblocks.vault_account_count ?? 0}</span>
          <span>Balance lines: {status.fireblocks.balance_line_count ?? 0}</span>
          <span>Transactions: {status.fireblocks.transaction_count ?? 0}</span>
          {status.fireblocks.api_latency_ms != null && (
            <span>API latency: {status.fireblocks.api_latency_ms}ms</span>
          )}
          <span>JWT signing: {status.fireblocks.jwt_signing_valid ? "valid" : "invalid"}</span>
        </div>
      )}

      {!status.fireblocks.connected && status.fireblocks.error && (
        <div className="error-banner">{status.fireblocks.error}</div>
      )}
    </section>
  );
}
