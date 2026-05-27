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
  /** Reduced visual weight — collapsed by default unless integration failure */
  demoted?: boolean;
}

export function SystemStatusPanel({ demoted = false }: Props) {
  const [status, setStatus] = useState<SystemIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!demoted);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch(`${API_URL}/v1/system/status`);
        const data = (await response.json()) as SystemIntegrationStatus;
        if (active) {
          setStatus(data);
          if (!response.ok) {
            const failed = data.checks.filter(
              (c) => c.status === "disconnected" || c.status === "inactive",
            );
            setError(
              failed.length > 0
                ? `Integration failure: ${failed.map((c) => c.label).join(", ")}`
                : "One or more integrations are unavailable",
            );
            if (demoted) setExpanded(true);
          } else {
            setError(null);
          }
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Status unavailable");
          if (demoted) setExpanded(true);
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
  }, [demoted]);

  const panelTitle = "Operational Integrity";

  if (loading && !status) {
    return (
      <section className={`panel integrity-panel ${demoted ? "demoted" : ""}`}>
        <h2>{panelTitle}</h2>
        <p className="loading">Checking platform integrity…</p>
      </section>
    );
  }

  if (error && !status) {
    return (
      <section className={`panel integrity-panel ${demoted ? "demoted" : ""}`}>
        <h2>{panelTitle}</h2>
        <div className="error-banner">{error}</div>
      </section>
    );
  }

  if (!status) return null;

  const hasIntegrationFailure = status.checks.some(
    (c) =>
      ["fireblocks", "openai", "anthropic"].includes(c.id) &&
      (c.status === "disconnected" || c.status === "inactive"),
  );

  const primaryChecks = status.checks.filter((c) =>
    ["fireblocks", "openai", "anthropic"].includes(c.id),
  );
  const governanceChecks = status.checks.filter((c) =>
    ["audit_logging", "rbac", "real_data_mode"].includes(c.id),
  );

  const allHealthy = !error && !hasIntegrationFailure;
  const summaryLabel = allHealthy
    ? "All integrations operational"
    : "Attention required — expand for details";

  return (
    <section className={`panel integrity-panel ${demoted ? "demoted" : ""}`}>
      <div className="panel-header integrity-header">
        <div>
          <h2>{panelTitle}</h2>
          {demoted && !expanded ? (
            <p className="panel-desc integrity-summary">
              <span className={`integrity-dot ${allHealthy ? "ok" : "warn"}`} />
              {summaryLabel}
              {status.fireblocks.connected && (
                <>
                  {" "}
                  · {status.fireblocks.transaction_count ?? 0} transactions ·{" "}
                  {status.fireblocks.vault_account_count ?? 0} vaults
                </>
              )}
            </p>
          ) : (
            <p className="panel-desc">
              Platform connectivity and governance controls — {status.data_mode.toUpperCase()} data
              mode
              {status.fireblocks.sandbox_mode ? " · Fireblocks sandbox" : ""}
            </p>
          )}
        </div>
        <div className="integrity-header-actions">
          {demoted && (
            <button
              type="button"
              className="btn-secondary btn-sm integrity-toggle"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
          <span className="status-timestamp mono">
            {new Date(status.checked_at).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {(!demoted || expanded) && (
        <>
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

          {(error || hasIntegrationFailure) && (
            <div className="error-banner">
              {error ??
                "Integration failure — resolve credentials before running workflows. Demo data is not used as fallback."}
            </div>
          )}

          {status.fireblocks.connected && !demoted && (
            <div className="fireblocks-metrics">
              <span>Vault accounts: {status.fireblocks.vault_account_count ?? 0}</span>
              <span>Balance lines: {status.fireblocks.balance_line_count ?? 0}</span>
              <span>Transactions: {status.fireblocks.transaction_count ?? 0}</span>
              {status.fireblocks.api_latency_ms != null && (
                <span>API latency: {status.fireblocks.api_latency_ms}ms</span>
              )}
            </div>
          )}

          {!status.fireblocks.connected && status.fireblocks.error && (
            <div className="error-banner">{status.fireblocks.error}</div>
          )}
        </>
      )}
    </section>
  );
}
