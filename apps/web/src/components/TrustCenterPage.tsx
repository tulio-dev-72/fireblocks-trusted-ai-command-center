import { useEffect, useState } from "react";
import type { TrustCenterStatus } from "@taicc/shared-types";
import { apiGet } from "../lib/api";

type DataUseLink = { label: string; href: string };

const PROVIDER_DATA_USE: Record<string, { name: string; links: DataUseLink[] }> = {
  openai: {
    name: "OpenAI",
    links: [
      { label: "OpenAI — business data & training policy", href: "https://openai.com/business-data/" },
      {
        label: "API data controls & retention",
        href: "https://developers.openai.com/api/docs/guides/your-data",
      },
    ],
  },
  anthropic: {
    name: "Anthropic",
    links: [
      {
        label: "Anthropic — commercial terms (no training on API data)",
        href: "https://www.anthropic.com/legal/commercial-terms",
      },
      { label: "Anthropic privacy center", href: "https://privacy.anthropic.com/" },
    ],
  },
};

const MODEL_TILES: Array<{ key: keyof TrustCenterStatus; label: string }> = [
  { key: "model_provider", label: "Model Provider" },
  { key: "model_id", label: "Model ID" },
  { key: "data_mode", label: "Data Mode" },
];

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

  const provider = status.model_provider;
  const usesExternalLlm = provider === "openai" || provider === "anthropic";
  const providerDataUse = PROVIDER_DATA_USE[provider];

  return (
    <div className="trust-center">
      <section className="panel trust-hero">
        <h2>Trust Center</h2>
        <p className="panel-desc">
          Runtime configuration for data access boundaries, RBAC, audit logging, and LLM provider
          selection. Values reflect the current deployment — not marketing claims.
        </p>
        <div className="trust-model-grid">
          {MODEL_TILES.map((tile) => (
            <div key={tile.key} className="trust-model-tile">
              <span className="trust-label">{tile.label}</span>
              <strong className="mono">{String(status[tile.key] ?? "—")}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel trust-dataflow">
        <h3>How AI uses your data</h3>
        <p className="panel-desc">
          Is Fireblocks data sent to the language model? Here is the exact runtime flow for this
          deployment.
        </p>

        <ol className="trust-flow">
          <li className="trust-flow-step">
            <span className="trust-flow-num">1</span>
            <div>
              <strong>Retrieve</strong>
              <p>
                Under RBAC, the investigator reads live Fireblocks sandbox data — transactions,
                approval queue, vault balances, and the active policy.
              </p>
            </div>
          </li>
          <li className="trust-flow-step">
            <span className="trust-flow-num">2</span>
            <div>
              <strong>Ground</strong>
              <p>
                Each record is reduced to a short, citation-tagged excerpt (capped to ~180
                characters) — summaries, not full API payloads.
              </p>
            </div>
          </li>
          <li className="trust-flow-step">
            <span className="trust-flow-num">3</span>
            <div>
              <strong>{usesExternalLlm ? "Send to model" : "Synthesize locally"}</strong>
              <p>
                {usesExternalLlm ? (
                  <>
                    Those Fireblocks-derived excerpts are included in the prompt sent to{" "}
                    <strong>{providerDataUse?.name ?? provider}</strong>&rsquo;s API (
                    <span className="mono">{status.model_id}</span>) to generate the analysis.
                  </>
                ) : (
                  <>
                    No external model is configured. Answers are synthesized locally from the
                    retrieved evidence — nothing leaves this environment.
                  </>
                )}
              </p>
            </div>
          </li>
          <li className="trust-flow-step">
            <span className="trust-flow-num">4</span>
            <div>
              <strong>Constrain</strong>
              <p>
                Read-only — no signing, submission, or approval. AI output never auto-executes;
                human approval in the Fireblocks Console is required. Prompts are written to the
                append-only audit log when prompt logging is enabled.
              </p>
            </div>
          </li>
        </ol>

        <div className={`trust-answer ${usesExternalLlm ? "external" : "local"}`}>
          {usesExternalLlm ? (
            <>
              <strong>Yes</strong> — with {providerDataUse?.name ?? provider} configured,
              summarized Fireblocks evidence is sent to the provider&rsquo;s API. By default these
              providers do not train on API data; review their data-use terms below.
            </>
          ) : (
            <>
              <strong>No</strong> — no external model is configured, so Fireblocks data is never
              sent off-box. Evidence is formatted and synthesized locally.
            </>
          )}
        </div>
      </section>

      <div className="trust-grid">
        {status.controls.map((control) => (
          <div key={control.id} className="trust-control-card">
            <div className="trust-control-header">
              <h3>{control.label}</h3>
              <span className={`trust-pill ${control.status}`}>{control.status}</span>
            </div>
            <p>{control.description}</p>
            {control.detail && <p className="trust-detail">{control.detail}</p>}
          </div>
        ))}
      </div>

      <section className="panel trust-statement">
        <h3>LLM Provider Data Use</h3>
        <p>{status.no_training_statement.description}</p>
        {usesExternalLlm && providerDataUse ? (
          <div className="trust-links">
            {providerDataUse.links.map((link) => (
              <a
                key={link.href}
                className="trust-link"
                href={link.href}
                target="_blank"
                rel="noreferrer"
              >
                {link.label} ↗
              </a>
            ))}
          </div>
        ) : (
          <p className="trust-detail">
            Local evidence formatting is active — no external model API is called, so no provider
            data-use terms apply to this deployment.
          </p>
        )}
      </section>
    </div>
  );
}
