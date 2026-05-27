import { useEffect, useState } from "react";
import type {
  SandboxActivityCapabilities,
  SandboxActivityResult,
} from "@taicc/shared-types";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { apiGetSandboxAdmin, apiPostSandboxAdmin } from "../lib/api";

export function SandboxActivityGeneratorPanel() {
  const [capabilities, setCapabilities] = useState<SandboxActivityCapabilities | null>(null);
  const [result, setResult] = useState<SandboxActivityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const [createVault, setCreateVault] = useState(true);
  const [vaultName, setVaultName] = useState("");
  const [enableTransfer, setEnableTransfer] = useState(false);
  const [sourceVaultId, setSourceVaultId] = useState("");
  const [destinationVaultId, setDestinationVaultId] = useState("");
  const [assetId, setAssetId] = useState("ETH_TEST5");
  const [amount, setAmount] = useState("0.001");

  useEffect(() => {
    apiGetSandboxAdmin<SandboxActivityCapabilities>("/v1/sandbox/activity/capabilities")
      .then(setCapabilities)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load capabilities"),
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    if (!confirmed) {
      setError("Confirm you are initiating this manually (not via AI) before generating.");
      return;
    }

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const payload = {
        human_confirmed: true as const,
        create_vault: createVault,
        vault_name: vaultName.trim() || undefined,
        include_snapshot: true,
        transfer: enableTransfer
          ? {
              source_vault_id: sourceVaultId.trim(),
              destination_vault_id: destinationVaultId.trim(),
              asset_id: assetId.trim(),
              amount: amount.trim(),
              note: "TAICC UI sandbox activity — explicit human-initiated vault transfer",
            }
          : undefined,
      };

      const data = await apiPostSandboxAdmin<SandboxActivityResult>(
        "/v1/sandbox/activity/generate",
        payload,
      );
      setResult(data);
      if (!data.ok) {
        setError(data.errors.join("; ") || data.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sandbox activity failed");
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <p className="loading">Checking sandbox activity permissions…</p>;

  return (
    <section className="panel sandbox-activity-panel">
      <h2>Generate Sandbox Activity</h2>
      <p className="panel-desc">
        Human-initiated Fireblocks sandbox writes only. Labeled{" "}
        <strong>REAL_FIREBLOCKS_SANDBOX</strong>. Never triggered by AI workflows.
      </p>

      <div className="mode-banner mode-demo">
        Sandbox only · Vault-to-vault test transfers · Read-only AI investigator
      </div>

      {!capabilities?.can_generate && (
        <div className="error-banner">
          {capabilities?.reason ??
            "Admin credentials required. Set VITE_SANDBOX_ADMIN_TOKEN on Vercel (same value as Render SANDBOX_ADMIN_TOKEN)."}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {result?.ok && (
        <div className="success-banner">
          {result.message}
          {result.provenance && (
            <>
              {" "}
              <ProvenanceBadge provenance={result.provenance} compact />
            </>
          )}
        </div>
      )}

      <div className="connection-grid">
        <StatusRow label="Sandbox endpoint" value={capabilities?.sandbox_only ? "Yes" : "No"} ok={capabilities?.sandbox_only} />
        <StatusRow label="Admin authorized" value={capabilities?.can_generate ? "Yes" : "No"} ok={capabilities?.can_generate} />
        <StatusRow label="AI execution" value="Blocked" ok />
      </div>

      <div className="sandbox-activity-form">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={createVault}
            onChange={(e) => setCreateVault(e.target.checked)}
            disabled={!capabilities?.can_generate || running}
          />
          Create test vault account
        </label>
        {createVault && (
          <input
            className="text-input"
            placeholder="Vault name (optional)"
            value={vaultName}
            onChange={(e) => setVaultName(e.target.value)}
            disabled={!capabilities?.can_generate || running}
          />
        )}

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={enableTransfer}
            onChange={(e) => setEnableTransfer(e.target.checked)}
            disabled={!capabilities?.can_generate || running}
          />
          Submit vault-to-vault test transfer
        </label>
        {enableTransfer && (
          <div className="transfer-fields">
            <input className="text-input" placeholder="Source vault ID" value={sourceVaultId} onChange={(e) => setSourceVaultId(e.target.value)} disabled={running} />
            <input className="text-input" placeholder="Destination vault ID" value={destinationVaultId} onChange={(e) => setDestinationVaultId(e.target.value)} disabled={running} />
            <input className="text-input" placeholder="Asset ID" value={assetId} onChange={(e) => setAssetId(e.target.value)} disabled={running} />
            <input className="text-input" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={running} />
          </div>
        )}

        <label className="checkbox-row confirm-row">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={!capabilities?.can_generate || running}
          />
          I am a human operator initiating sandbox activity (not an AI workflow)
        </label>

        <button
          type="button"
          className="primary-btn"
          onClick={handleGenerate}
          disabled={!capabilities?.can_generate || running || !confirmed}
        >
          {running ? "Generating…" : "Generate Sandbox Activity"}
        </button>
      </div>

      {result?.steps?.length ? (
        <>
          <h3>Activity steps</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {result.steps.map((step, index) => (
                <tr key={`${step.action}-${index}`}>
                  <td className="mono">{step.action}</td>
                  <td className={step.ok ? "status-ok" : "status-fail"}>{step.ok ? "OK" : "Failed"}</td>
                  <td>{step.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <p className="provenance-note">
        Prefer automation? Run <code className="mono">pnpm fireblocks:seed-sandbox</code> from the
        project root with sandbox credentials. CLI activity is also logged to{" "}
        <code className="mono">audit_events</code>.
      </p>
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
