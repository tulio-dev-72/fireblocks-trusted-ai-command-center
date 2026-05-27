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
        Aggregated evidence bundles used by AI workflows. Every item carries provenance metadata
        and is eligible for citation in trusted answers.
      </p>
      <div className="ai-sources">
        AI-eligible sources:{" "}
        {evidence.ai_eligible_sources.length === 0
          ? "None (demo/hybrid mode or no real data)"
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
