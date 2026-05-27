import { useEffect, useState } from "react";
import type { TrustCenterStatus } from "@taicc/shared-types";
import { apiGet } from "../lib/api";

export function TrustCenterPage() {
  const [status, setStatus] = useState<TrustCenterStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<TrustCenterStatus>("/v1/trust/status")
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!status) return <p className="loading">Loading trust controls…</p>;

  return (
    <div className="trust-center">
      <section className="panel trust-hero">
        <h2>Trust Center</h2>
        <p className="panel-desc">
          Runtime configuration for data access boundaries, RBAC, audit logging, and LLM provider
          selection. Values reflect the current deployment — not marketing claims.
        </p>
        <div className="trust-model-bar">
          <div>
            <span className="trust-label">Model Provider</span>
            <strong>{status.model_provider}</strong>
          </div>
          <div>
            <span className="trust-label">Model ID</span>
            <strong>{status.model_id}</strong>
          </div>
          <div>
            <span className="trust-label">Data Mode</span>
            <strong>{status.data_mode}</strong>
          </div>
        </div>
      </section>

      <div className="trust-grid">
        {status.controls.map((control) => (
          <div key={control.id} className={`trust-control-card status-${control.status}`}>
            <div className="trust-control-header">
              <h3>{control.label}</h3>
              <span className={`control-status status-${control.status}`}>
                {control.status}
              </span>
            </div>
            <p>{control.description}</p>
            {control.detail && <p className="trust-detail">{control.detail}</p>}
          </div>
        ))}
      </div>

      <section className="panel trust-statement">
        <h3>LLM Provider Data Use</h3>
        <p>{status.no_training_statement.description}</p>
      </section>
    </div>
  );
}
