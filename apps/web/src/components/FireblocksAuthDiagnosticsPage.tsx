import { useEffect, useState } from "react";
import type { FireblocksAuthDiagnostics } from "@taicc/shared-types";
import { fetchFireblocksAuthDiagnostics, API_URL } from "../lib/api";
import { hasApiAuthConfigured } from "../lib/auth";

export function FireblocksAuthDiagnosticsPage() {
  const [diagnostics, setDiagnostics] = useState<FireblocksAuthDiagnostics | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchFireblocksAuthDiagnostics();
        setDiagnostics(result.data as FireblocksAuthDiagnostics);
        setHttpStatus(result.status);
        if (!result.ok) {
          setError(
            (result.data as FireblocksAuthDiagnostics)?.auth_test?.error ??
              `Diagnostics returned HTTP ${result.status}`,
          );
        } else {
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load diagnostics");
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p className="loading">Running Fireblocks JWT auth diagnostics…</p>;

  const pk = diagnostics?.private_key;
  const jwt = diagnostics?.jwt_generation;
  const env = diagnostics?.environment;
  const signed = diagnostics?.signed_request;
  const test = diagnostics?.auth_test;
  const appAuth = diagnostics?.app_api_auth;

  return (
    <div className="connection-page fb-auth-diagnostics">
      <section className="panel">
        <h2>Fireblocks Auth Diagnostics</h2>
        <p className="panel-desc">
          Validates RS256 JWT signing against Fireblocks sandbox. Endpoint:{" "}
          <code>{API_URL}/v1/fireblocks/auth-diagnostics</code>
        </p>
        {!test?.ok && (
          <div className="error-banner">
            {error ?? test?.error ?? "Fireblocks authentication test failed"}
          </div>
        )}
        {test?.ok && (
          <div className="success-banner">Fireblocks JWT auth OK — sandbox reachable</div>
        )}
      </section>

      <section className="panel">
        <h2>Platform API Auth (separate from Fireblocks JWT)</h2>
        <p className="provenance-note">
          UI errors like &quot;Malformed JWT&quot; usually mean <code>VITE_API_TOKEN</code> is missing
          or invalid — not Fireblocks signing.
        </p>
        <div className="connection-grid">
          <StatusRow
            label="Client token configured"
            value={hasApiAuthConfigured() ? "Yes" : "No"}
            ok={hasApiAuthConfigured()}
          />
          <StatusRow
            label="Bearer format"
            value={appAuth?.bearer_format ?? "—"}
            ok={appAuth?.bearer_format === "viewer_token" || appAuth?.bearer_format === "jwt" || appAuth?.bearer_format === "dev"}
          />
          <StatusRow label="Note" value={appAuth?.note ?? "—"} />
        </div>
      </section>

      <section className="panel">
        <h2>Private Key</h2>
        <div className="connection-grid">
          <StatusRow label="Loaded" value={pk?.loaded ? "Yes" : "No"} ok={pk?.loaded} />
          <StatusRow label="Source" value={pk?.source ?? "—"} />
          <StatusRow label="Format" value={pk?.format ?? "—"} />
          <StatusRow label="Key type" value={pk?.key_type ?? "—"} />
          <StatusRow label="RSA signing" value={pk?.rsa_signing_ok ? "OK" : "Failed"} ok={pk?.rsa_signing_ok} />
          <StatusRow label="Literal \\n in env" value={pk?.has_literal_backslash_n ? "Yes (normalized)" : "No"} />
          <StatusRow label="Wrapped in quotes" value={pk?.has_wrapped_quotes ? "Yes (stripped)" : "No"} />
          {pk?.file_path && <StatusRow label="File path" value={pk.file_path} mono />}
        </div>
        {pk?.errors?.length ? (
          <ul className="endpoint-list">
            {pk.errors.map((e) => (
              <li key={e} className="endpoint-fail">{e}</li>
            ))}
          </ul>
        ) : null}
        {pk?.remediation && !pk.loaded && (
          <p className="provenance-note remediation">{pk.remediation}</p>
        )}
      </section>

      <section className="panel">
        <h2>Environment</h2>
        <div className="connection-grid">
          <StatusRow label="API key present" value={env?.api_key_present ? "Yes" : "No"} ok={env?.api_key_present} />
          <StatusRow label="API key" value={env?.api_key_preview ?? "—"} mono />
          <StatusRow label="Base path" value={env?.base_path ?? "—"} mono />
          <StatusRow label="Inline key (FIREBLOCKS_PRIVATE_KEY)" value={env?.inline_key_configured ? "Yes" : "No"} />
          <StatusRow label="Secret key path" value={env?.secret_key_path ?? "—"} mono />
          <StatusRow
            label="Sandbox connectivity"
            value={diagnostics?.sandbox_connectivity ?? "—"}
            ok={diagnostics?.sandbox_connectivity === "ok"}
          />
          <StatusRow label="HTTP status" value={httpStatus != null ? String(httpStatus) : "—"} />
        </div>
      </section>

      <section className="panel">
        <h2>JWT Generation</h2>
        <div className="connection-grid">
          <StatusRow label="Status" value={jwt?.ok ? "OK" : "Failed"} ok={jwt?.ok} />
          <StatusRow label="Message" value={jwt?.message ?? "—"} />
          <StatusRow label="Algorithm" value={jwt?.preview?.algorithm ?? "—"} mono />
          <StatusRow label="URI signed" value={jwt?.preview?.uri_signed ?? "—"} mono />
          <StatusRow label="sub (API key)" value={jwt?.preview?.sub_preview ?? "—"} mono />
          <StatusRow label="TTL (seconds)" value={jwt?.preview?.ttl_seconds != null ? String(jwt.preview.ttl_seconds) : "—"} />
          <StatusRow label="bodyHash" value={jwt?.preview?.body_hash ?? "—"} mono />
        </div>
        {jwt?.preview?.header && (
          <pre className="code-block">{JSON.stringify(jwt.preview.header, null, 2)}</pre>
        )}
        {jwt?.preview?.payload && (
          <pre className="code-block">{JSON.stringify(jwt.preview.payload, null, 2)}</pre>
        )}
      </section>

      {signed && (
        <section className="panel">
          <h2>Signed Request Preview</h2>
          <div className="connection-grid">
            <StatusRow label="Method" value={signed.method} />
            <StatusRow label="URL" value={signed.url} mono />
            <StatusRow label="JWT uri claim" value={signed.uri_signed_in_jwt} mono />
            <StatusRow label="Authorization format" value={signed.authorization_header_format} ok={!signed.authorization_malformed} />
            <StatusRow label="JWT segments" value={String(signed.jwt_segment_count)} ok={signed.jwt_segment_count === 3} />
            <StatusRow label="X-API-Key" value={signed.x_api_key_preview ?? "—"} mono />
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Auth Test — GET /vault/accounts_paged</h2>
        <div className="connection-grid">
          <StatusRow label="Result" value={test?.ok ? "Pass" : "Fail"} ok={test?.ok} />
          <StatusRow label="HTTP status" value={test?.http_status != null ? String(test.http_status) : "—"} />
          <StatusRow label="Latency" value={test?.latency_ms != null ? `${test.latency_ms}ms` : "—"} />
        </div>
        {test?.response_body_preview && (
          <>
            <h3>Fireblocks response body</h3>
            <pre className="code-block">{test.response_body_preview}</pre>
          </>
        )}
        {test?.error && !test.ok && <p className="endpoint-fail">{test.error}</p>}
      </section>

      {diagnostics?.auth_log?.length ? (
        <section className="panel">
          <h2>Server Auth Log</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Phase</th>
                <th>Status</th>
                <th>Detail</th>
                <th>At</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.auth_log.map((entry, i) => (
                <tr key={`${entry.phase}-${i}`}>
                  <td className="mono">{entry.phase}</td>
                  <td className={entry.status === "ok" ? "status-ok" : "status-fail"}>{entry.status}</td>
                  <td>{entry.detail}</td>
                  <td className="mono">{new Date(entry.at).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {diagnostics?.credential_checks?.length ? (
        <section className="panel">
          <h2>Credential Checks</h2>
          <table className="table">
            <thead>
              <tr><th>Check</th><th>Status</th><th>Details</th></tr>
            </thead>
            <tbody>
              {diagnostics.credential_checks.map((c) => (
                <tr key={c.check}>
                  <td className="mono">{c.check}</td>
                  <td className={c.valid ? "status-ok" : "status-fail"}>{c.valid ? "Valid" : "Invalid"}</td>
                  <td>{c.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
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
