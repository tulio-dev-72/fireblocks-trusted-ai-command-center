import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { SystemStatusPanel } from "./SystemStatusPanel";

interface HomePageProps {
  onStartInvestigation: () => void;
}

export function HomePage({ onStartInvestigation }: HomePageProps) {
  const [txCount, setTxCount] = useState<number | null>(null);
  const [delayedCount, setDelayedCount] = useState<number | null>(null);
  const [vaultCount, setVaultCount] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [txs, vaults] = await Promise.all([
          apiGet<{ data?: Array<{ status: string }>; available: boolean }>(
            "/v1/transactions",
          ).catch(() => null),
          apiGet<{ data?: unknown[]; available: boolean }>("/v1/vault-accounts").catch(
            () => null,
          ),
        ]);

        if (txs?.available && txs.data) {
          setTxCount(txs.data.length);
          setDelayedCount(
            txs.data.filter(
              (t) =>
                !["COMPLETED", "CANCELLED", "REJECTED", "BLOCKED"].includes(t.status),
            ).length,
          );
        }
        if (vaults?.available && vaults.data) {
          setVaultCount(vaults.data.length);
        }
      } catch {
        /* overview degrades gracefully */
      }
    }
    load();
  }, []);

  return (
    <div className="home-page">
      <SystemStatusPanel />

      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">Treasury Operations</span>
          <h2>Evidence-backed investigation over live Fireblocks sandbox data</h2>
          <p>
            Read-only integration. Every workflow retrieves real transaction, balance, and
            policy records, applies RBAC, logs to an immutable audit trail, and returns cited
            AI analysis.
          </p>
          <div className="hero-actions">
            <button className="btn-primary btn-lg" onClick={onStartInvestigation}>
              Run Delayed Payments Investigator
            </button>
          </div>
        </div>
      </section>

      <div className="stats-grid">
        <div className={`stat-card ${delayedCount && delayedCount > 0 ? "warn" : ""}`}>
          <span className="stat-value">{delayedCount ?? "—"}</span>
          <span className="stat-label">Non-final transactions (live)</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{txCount ?? "—"}</span>
          <span className="stat-label">Transactions retrieved (live)</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{vaultCount ?? "—"}</span>
          <span className="stat-label">Vault accounts (live)</span>
        </div>
      </div>

      <section className="panel workflow-preview">
        <h2>Delayed Payments Investigator</h2>
        <p className="panel-desc">
          Operational workflow over real Fireblocks data — classifies pending and delayed
          transfers, builds an evidence bundle, and returns a cited AI explanation.
        </p>
        <ol className="workflow-steps-preview">
          <li>RBAC authorization and audit log entry</li>
          <li>Retrieve transactions, approvals, balances, and policy from Fireblocks</li>
          <li>Classify delays by root cause</li>
          <li>Generate evidence-backed AI explanation</li>
          <li>Return citations, recommendations, and correlation ID for audit review</li>
        </ol>
      </section>
    </div>
  );
}
