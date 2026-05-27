import { SandboxActivityGeneratorPanel } from "./SandboxActivityGeneratorPanel";
import { useEffect, useState } from "react";
import type { SandboxDataReadiness } from "@taicc/shared-types";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { apiGet } from "../lib/api";

function formatCount(value: number | null | undefined): string {
  if (value == null) return "Unavailable";
  return String(value);
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function SandboxDataReadinessPage() {
  const [readiness, setReadiness] = useState<SandboxDataReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiGet<SandboxDataReadiness>("/v1/fireblocks/sandbox-readiness");
        setReadiness(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sandbox readiness");
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p className="loading">Assessing Fireblocks sandbox data readiness…</p>;

  const metrics = readiness?.metrics;

  return (
    <div className="connection-page sandbox-readiness-page">
      {error && <div className="error-banner">{error}</div>}

      {readiness?.empty_state_message && (
        <div className="error-banner">{readiness.empty_state_message}</div>
      )}

      {readiness?.investigation_ready && (
        <div className="success-banner">
          Sandbox has live transaction activity — operational investigations are supported.
        </div>
      )}

      <section className="panel">
        <h2>Operational Data Readiness</h2>
        <p className="panel-desc">
          Live metrics from Fireblocks sandbox APIs only. Nothing is fabricated when data is missing.
        </p>
        <div className="connection-grid">
          <StatusRow
            label="Investigation ready"
            value={readiness?.investigation_ready ? "Yes" : "No"}
            ok={readiness?.investigation_ready}
          />
          <StatusRow
            label="Connected"
            value={readiness?.connected ? "Yes" : "No"}
            ok={readiness?.connected}
          />
          <StatusRow label="Sandbox mode" value={readiness?.sandbox_mode ? "Yes" : "No"} />
          <StatusRow label="Data mode" value={readiness?.data_mode ?? "—"} />
          <StatusRow label="Summary" value={readiness?.readiness_summary ?? "—"} />
          <StatusRow
            label="Last successful Fireblocks sync"
            value={formatTimestamp(readiness?.last_successful_sync)}
          />
          <StatusRow
            label="Last transaction"
            value={formatTimestamp(metrics?.last_transaction_at)}
          />
          <StatusRow label="Checked at" value={formatTimestamp(readiness?.checked_at)} />
        </div>
        {readiness?.provenance && (
          <p className="provenance-note">
            Source:{" "}
            <ProvenanceBadge provenance={readiness.provenance} compact />
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Operational Metrics</h2>
        <div className="connection-grid">
          <StatusRow
            label="Vault accounts"
            value={formatCount(metrics?.vault_count)}
            ok={readiness?.availability.vaults}
          />
          <StatusRow
            label="External wallets"
            value={formatCount(metrics?.external_wallet_count)}
            ok={readiness?.availability.wallets}
          />
          <StatusRow
            label="Balance lines"
            value={formatCount(metrics?.balance_lines_available)}
            ok={readiness?.availability.balances}
          />
          <StatusRow
            label="Balances with funds"
            value={formatCount(metrics?.balances_with_funds)}
            ok={readiness?.availability.balances}
          />
          <StatusRow
            label="Transactions"
            value={formatCount(metrics?.transaction_count)}
            ok={readiness?.availability.transactions}
          />
          <StatusRow
            label="Non-final transactions"
            value={formatCount(metrics?.non_final_transaction_count)}
          />
          <StatusRow
            label="Failed transfers"
            value={formatCount(metrics?.failed_transaction_count)}
          />
          <StatusRow
            label="Pending approvals"
            value={formatCount(metrics?.pending_approval_count)}
            ok={readiness?.availability.approvals}
          />
        </div>
      </section>

      {readiness?.errors?.length ? (
        <section className="panel">
          <h2>Retrieval Notes</h2>
          <ul className="endpoint-list">
            {readiness.errors.map((entry) => (
              <li key={entry} className="endpoint-fail">{entry}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <SandboxActivityGeneratorPanel />
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
