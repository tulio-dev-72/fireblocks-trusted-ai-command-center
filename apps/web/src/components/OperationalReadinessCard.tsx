import { useEffect, useState } from "react";
import type { SandboxDataReadiness } from "@taicc/shared-types";
import { apiGet } from "../lib/api";
import type { Page } from "../lib/navigation";

interface OperationalReadinessCardProps {
  onNavigate: (page: Page) => void;
}

export function OperationalReadinessCard({ onNavigate }: OperationalReadinessCardProps) {
  const [readiness, setReadiness] = useState<SandboxDataReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<SandboxDataReadiness>("/v1/fireblocks/sandbox-readiness")
      .then(setReadiness)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Readiness unavailable"),
      );
  }, []);

  const metrics = readiness?.metrics;

  return (
    <section className="panel readiness-home-card">
      <span className="section-eyebrow">Operational Data Readiness</span>
      <h2>Fireblocks environment readiness</h2>
      <p className="panel-desc">
        Whether the connected Fireblocks sandbox has sufficient operational data to power
        investigations.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="connection-grid">
        <StatusRow
          label="Fireblocks connected"
          value={readiness?.connected ? "Yes" : readiness ? "No" : "—"}
          ok={readiness?.connected}
        />
        <StatusRow
          label="Environment"
          value={readiness?.sandbox_mode ? "Sandbox" : readiness ? "Production" : "—"}
        />
        <StatusRow
          label="Investigation ready"
          value={readiness?.investigation_ready ? "Yes" : readiness ? "No" : "—"}
          ok={readiness?.investigation_ready}
        />
        <StatusRow
          label="Transaction count"
          value={metrics?.transaction_count != null ? String(metrics.transaction_count) : "—"}
        />
        <StatusRow
          label="Vault accounts"
          value={metrics?.vault_count != null ? String(metrics.vault_count) : "—"}
        />
        <StatusRow
          label="Last successful sync"
          value={
            readiness?.last_successful_sync
              ? new Date(readiness.last_successful_sync).toLocaleString()
              : "—"
          }
        />
      </div>

      {readiness?.provenance && (
        <p className="provenance-note">
          Data provenance:{" "}
          <code className="mono">{readiness.provenance.source_type}</code>
        </p>
      )}

      <button
        type="button"
        className="btn-secondary"
        onClick={() => onNavigate("sandbox-readiness")}
      >
        Open Operational Data Readiness
      </button>
    </section>
  );
}

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  let cls = "";
  if (ok === true) cls = "status-ok";
  if (ok === false) cls = "status-fail";

  return (
    <div className="status-row">
      <span className="status-label">{label}</span>
      <span className={`status-value ${cls}`}>{value}</span>
    </div>
  );
}
