import { useEffect, useState } from "react";
import type { EvidenceItem } from "@taicc/shared-types";
import { ProvenanceBadge, UnavailableLabel } from "./ProvenanceBadge";

import { apiGet } from "../lib/api";

interface EvidenceResponse {
  mode: string;
  items: EvidenceItem[];
  ai_eligible_sources: string[];
}

export function EvidencePanel() {
  const [evidence, setEvidence] = useState<EvidenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiGet<EvidenceResponse>("/v1/evidence");
        setEvidence(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load evidence");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="loading">Loading evidence panel…</p>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!evidence) return null;

  return (
    <section className="panel">
      <h2>Evidence Library</h2>
      <p className="panel-desc">
        Aggregated evidence bundles retrieved for AI workflows. Each item includes provenance
        metadata and is eligible for citation when source_type is REAL_FIREBLOCKS.
      </p>
      <div className="ai-sources">
        RBAC-filtered sources eligible for LLM citation:{" "}
        {evidence.ai_eligible_sources.length === 0
          ? "None available — verify REAL_FIREBLOCKS mode and permissions"
          : evidence.ai_eligible_sources.join(", ")}
      </div>

      <div className="evidence-list">
        {evidence.items.map((item) => (
          <div key={item.id} className="evidence-item">
            <div className="evidence-header">
              <span className="evidence-label">{item.label}</span>
              <ProvenanceBadge provenance={item.provenance} compact />
            </div>
            <div className="evidence-body">
              {item.available ? (
                <pre className="evidence-value">
                  {JSON.stringify(item.value, null, 2)}
                </pre>
              ) : (
                <UnavailableLabel reason={String(item.value)} />
              )}
            </div>
            {item.provenance.mocked_fields.length > 0 && (
              <div className="mocked-fields">
                Mocked fields: {item.provenance.mocked_fields.join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
