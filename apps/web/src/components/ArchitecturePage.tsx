export function ArchitecturePage() {
  return (
    <div className="architecture-page">
      <section className="panel">
        <h2>Architecture</h2>
        <p className="panel-desc">
          Components and trust boundaries implemented in this repository. Items marked{" "}
          <span className="planned-tag">Planned</span> are not wired in the current codebase.
        </p>
      </section>

      <section className="panel">
        <h3>Trust boundaries (implemented)</h3>
        <ul className="arch-list">
          <li>
            <strong>Read-only Fireblocks</strong> — SDK calls retrieve vault, transaction, balance,
            policy, and approval data; no signing or submission paths.
          </li>
          <li>
            <strong>RBAC before data access</strong> — protected routes call{" "}
            <code>requirePermission()</code> before Fireblocks retrieval or workflow execution.
          </li>
          <li>
            <strong>Evidence gate</strong> — <code>filterForAi()</code> excludes demo seed and
            non-<code>REAL_FIREBLOCKS</code> provenance from LLM context.
          </li>
          <li>
            <strong>Execution boundary</strong> — transaction draft, submit, sign, and approval
            routes return <code>403 EXECUTION_DISABLED</code>; nothing is submitted to Fireblocks.
          </li>
          <li>
            <strong>Audit correlation</strong> — workflow runs share a correlation ID across{" "}
            <code>evidence_retrieved</code>, <code>ai_prompt</code>, and <code>ai_response</code>{" "}
            events.
          </li>
        </ul>
      </section>

      <section className="panel">
        <h3>Request path (implemented)</h3>
        <ol className="arch-flow">
          <li>
            <strong>Authenticate</strong> — Bearer JWT (HS256); non-production accepts configured{" "}
            <code>dev-token</code>.
          </li>
          <li>
            <strong>Authorize (RBAC)</strong> — <code>AuthService.hasPermission()</code> checks role
            → permission map; denied requests return 403 and log <code>rbac_filter</code>.
          </li>
          <li>
            <strong>Audit (request)</strong> — <code>user_action</code> event per authenticated API
            call.
          </li>
          <li>
            <strong>Data retrieval</strong> — <code>DataService</code> routes to{" "}
            <code>FireblocksRealAdapterExtended</code> when <code>REAL_FIREBLOCKS=true</code>.
          </li>
          <li>
            <strong>Evidence filter</strong> — <code>toAiEvidence()</code> applies{" "}
            <code>filterForAi()</code> before LLM context is built.
          </li>
          <li>
            <strong>LLM call</strong> — OpenAI or Anthropic HTTP API, or local evidence formatting
            when no provider key is configured.
          </li>
          <li>
            <strong>Audit (workflow)</strong> — <code>evidence_retrieved</code>, <code>ai_prompt</code>
            , <code>ai_response</code>, <code>workflow_executed</code> events with correlation ID.
          </li>
        </ol>
      </section>

      <section className="panel">
        <h3>RBAC (implemented)</h3>
        <p className="arch-note arch-note-inline">
          Roles are embedded in JWT claims. Permissions are checked per route — not via a separate
          policy engine.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Permissions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">admin</td>
              <td>operations, approvals, policies, audit, agents (read/write)</td>
            </tr>
            <tr>
              <td className="mono">operator</td>
              <td>operations (read/write), approvals (read/write), audit (read), agents (read)</td>
            </tr>
            <tr>
              <td className="mono">approver</td>
              <td>operations (read), approvals (read/write), audit (read)</td>
            </tr>
            <tr>
              <td className="mono">viewer</td>
              <td>operations (read), audit (read), agents (read)</td>
            </tr>
            <tr>
              <td className="mono">agent</td>
              <td>operations (read/write)</td>
            </tr>
          </tbody>
        </table>
        <p className="arch-note">
          Workflow routes require <code>operations:read</code>. Audit queries require{" "}
          <code>audit:read</code>. <code>agents:*</code> permissions exist but{" "}
          <span className="planned-tag">Planned</span> agent registration endpoints are not exposed.
        </p>
      </section>

      <section className="panel">
        <h3>Evidence retrieval (implemented)</h3>
        <p className="panel-desc">
          Delayed Payments Investigator and <code>POST /v1/ai/ask</code> follow the same retrieval
          pattern:
        </p>
        <ol className="arch-flow">
          <li>
            Parallel Fireblocks reads: transactions, approvals, balances, active policy (
            <code>DataService.list*</code> / <code>getActivePolicy</code>).
          </li>
          <li>
            Each result wrapped in <code>ProvenanceRecord</code> with <code>source_type</code>,{" "}
            <code>api_endpoint</code>, and <code>fetched_at</code>.
          </li>
          <li>
            <code>toAiEvidence()</code> applies <code>filterForAi()</code> — blocks demo mode and
            non-REAL_FIREBLOCKS sources.
          </li>
          <li>
            <code>buildEvidenceContext()</code> serializes available records into LLM context with
            citation IDs (<code>ev-txs</code>, <code>ev-approvals</code>, etc.).
          </li>
          <li>
            Delay classifier groups non-final transactions by Fireblocks status codes (
            <code>PENDING_AUTHORIZATION</code>, <code>PENDING_AML_SCREENING</code>,{" "}
            <code>FAILED</code>, etc.) and available balance checks.
          </li>
        </ol>
      </section>

      <section className="panel">
        <h3>API surface (implemented)</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Permission</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">GET /health, /health/fireblocks</td>
              <td>—</td>
              <td>Service and Fireblocks connectivity probes</td>
            </tr>
            <tr>
              <td className="mono">GET /v1/data-mode, /v1/system/status</td>
              <td>— / —</td>
              <td>Data mode and integration posture</td>
            </tr>
            <tr>
              <td className="mono">GET /v1/fireblocks/connection-status</td>
              <td className="mono">operations:read</td>
              <td>Credential and endpoint probe results</td>
            </tr>
            <tr>
              <td className="mono">GET /v1/vault-accounts, /wallets, /balances, /transactions</td>
              <td className="mono">operations:read</td>
              <td>Read-only Fireblocks data with provenance</td>
            </tr>
            <tr>
              <td className="mono">GET /v1/policies, /approvals, /activity-logs, /counterparties</td>
              <td className="mono">operations:read / approvals:read</td>
              <td>Policy, approval queue, audit logs, counterparties</td>
            </tr>
            <tr>
              <td className="mono">GET /v1/evidence</td>
              <td className="mono">operations:read</td>
              <td>Aggregated evidence bundles for workflows</td>
            </tr>
            <tr>
              <td className="mono">POST /v1/workflows/delayed-payments/investigate</td>
              <td className="mono">operations:read</td>
              <td>Delayed Payments Investigator workflow</td>
            </tr>
            <tr>
              <td className="mono">POST /v1/workflows/delayed-payments/escalation-summary</td>
              <td className="mono">operations:read</td>
              <td>Prepare-only escalation draft from audit metadata</td>
            </tr>
            <tr>
              <td className="mono">POST /v1/ai/ask</td>
              <td className="mono">operations:read</td>
              <td>Evidence pipeline Q&amp;A over retrieved records</td>
            </tr>
            <tr>
              <td className="mono">POST /v1/transactions/draft</td>
              <td className="mono">—</td>
              <td>Disabled — returns 403 EXECUTION_DISABLED</td>
            </tr>
            <tr>
              <td className="mono">GET /v1/audit</td>
              <td className="mono">audit:read</td>
              <td>Query audit events by correlation ID</td>
            </tr>
            <tr>
              <td className="mono">GET /v1/trust/status</td>
              <td className="mono">operations:read</td>
              <td>Runtime trust control configuration</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>Fireblocks integration (implemented)</h3>
        <ul className="arch-list">
          <li>
            <code>@fireblocks/ts-sdk</code> with API key + RSA private key JWT signing
          </li>
          <li>
            Read paths: vault accounts, transactions, balances, policy, approvals, activity logs,
            network connections
          </li>
          <li>
            Connection verification at startup and via <code>/v1/fireblocks/connection-status</code>
          </li>
          <li>
            Every record tagged with <code>source_type: REAL_FIREBLOCKS</code> and API endpoint
          </li>
        </ul>
      </section>

      <section className="panel">
        <h3>AI provider abstraction (implemented)</h3>
        <ul className="arch-list">
          <li>
            <code>resolveLlmConfig()</code> — selects OpenAI, Anthropic, or local evidence formatting
          </li>
          <li>Provider selected by <code>AI_PROVIDER</code> env and available API keys</li>
          <li>System prompt restricts answers to retrieved evidence context only</li>
          <li>
            When no provider key is configured, <code>synthesizeFromEvidence()</code> formats
            retrieved records locally without an external API call
          </li>
        </ul>
      </section>

      <section className="panel">
        <h3>Audit logging (implemented — Postgres)</h3>
        <ul className="arch-list">
          <li>
            <code>PostgresAuditStore</code> — append-only <code>audit_events</code> table with
            database trigger blocking UPDATE/DELETE
          </li>
          <li>
            Event types: <code>user_action</code>, <code>rbac_filter</code>,{" "}
            <code>fireblocks_api_call</code>, <code>evidence_retrieved</code>, <code>ai_prompt</code>
            , <code>ai_response</code>, <code>workflow_executed</code>,{" "}
            <code>escalation_prepared</code>
          </li>
          <li>
            Configured via <code>DATABASE_URL</code> and <code>AUDIT_STORE=postgres</code> (default)
          </li>
        </ul>
      </section>

      <section className="panel planned-section">
        <h3>
          <span className="planned-tag">Planned</span> — not implemented in request path
        </h3>
        <ul className="arch-list">
          <li>OIDC / SSO authentication (JWT only today)</li>
          <li>
            Policy engine evaluation on each API request (<code>@taicc/policy-engine</code> package
            exists, not wired)
          </li>
          <li>
            <code>/v1/agents</code>, <code>/v1/operations</code> endpoints (permissions defined,
            routes not exposed)
          </li>
          <li>Redis-backed worker queue (worker process is a stub)</li>
          <li>Fireblocks webhook ingestion pipeline</li>
          <li>Co-signer / automated signing integration</li>
          <li>Production Kubernetes deployment hardening</li>
        </ul>
      </section>
    </div>
  );
}
