# Security Requirements

These requirements are **mandatory** for all components in this monorepo. No feature ships without satisfying the relevant controls.

## SR-1: Policy-First Execution

| ID       | Requirement |
|----------|-------------|
| SR-1.1   | Every operation MUST be evaluated by the policy engine before Fireblocks API execution. |
| SR-1.2   | Default policy action MUST be `deny`. |
| SR-1.3   | Policy evaluation MUST be synchronous for write operations. |
| SR-1.4   | Policy rules MUST be versioned; evaluations MUST record the rule version used. |

## SR-2: Authentication & Authorization

| ID       | Requirement |
|----------|-------------|
| SR-2.1   | All API endpoints (except `/health`) MUST require authenticated identity. |
| SR-2.2   | RBAC MUST enforce least-privilege access per role. |
| SR-2.3   | Agent identities MUST be registered and scoped to explicit capabilities. |
| SR-2.4   | Service accounts MUST use short-lived tokens; no long-lived API keys in application code. |
| SR-2.5   | MCP server MUST authenticate connecting clients before exposing tools. |

## SR-3: Audit & Compliance

| ID       | Requirement |
|----------|-------------|
| SR-3.1   | All policy decisions MUST be logged before action execution. |
| SR-3.2   | All Fireblocks API calls MUST be logged with request/response metadata (no secrets). |
| SR-3.3   | Audit records MUST be append-only; no UPDATE or DELETE on audit tables. |
| SR-3.4   | Each request MUST carry a correlation ID propagated across all services. |
| SR-3.5   | Audit logs MUST be retained per organizational policy (default: 7 years). |

## SR-4: Secrets Management

| ID       | Requirement |
|----------|-------------|
| SR-4.1   | Fireblocks API private keys MUST be loaded from filesystem or secret manager, never from env vars or source code. |
| SR-4.2   | `.env` files MUST NOT be committed. `.env.example` contains placeholders only. |
| SR-4.3   | JWT secrets in development MUST be rotated before production deployment. |
| SR-4.4   | Logs MUST NOT contain API keys, private keys, JWT tokens, or PII beyond actor ID. |

## SR-5: Human-in-the-Loop

| ID       | Requirement |
|----------|-------------|
| SR-5.1   | Operations exceeding spend thresholds MUST require human approval. |
| SR-5.2   | Operations to non-allowlisted destinations MUST require human approval. |
| SR-5.3   | Approval requests MUST expire after configurable timeout with deny-on-expiry. |
| SR-5.4   | Approvers MUST be distinct from the requesting agent/operator. |
| SR-5.5   | Approval decisions MUST be recorded in the audit log. |

## SR-6: Fireblocks Integration

| ID       | Requirement |
|----------|-------------|
| SR-6.1   | All Fireblocks calls MUST go through `@taicc/fireblocks-client` — no direct SDK usage in apps. |
| SR-6.2   | Transaction creation MUST validate against both local policy AND Fireblocks workspace policy. |
| SR-6.3   | Co-signer automation MUST only sign transactions pre-approved by local policy engine. |
| SR-6.4   | Sandbox and production Fireblocks environments MUST use separate credentials and configs. |

## SR-7: Network & Transport

| ID       | Requirement |
|----------|-------------|
| SR-7.1   | Production inter-service communication MUST use mTLS. |
| SR-7.2   | External API MUST enforce TLS 1.2+ with HSTS. |
| SR-7.3   | CORS MUST be restricted to known Command Center origins. |
| SR-7.4   | Rate limiting MUST be applied per actor at the API gateway. |

## SR-8: MCP Security

| ID       | Requirement |
|----------|-------------|
| SR-8.1   | MCP write tools MUST be disabled unless `POLICY_ENFORCEMENT_MODE=enforce` and explicit allow rules exist. |
| SR-8.2   | MCP tool invocations MUST follow the same auth → policy → audit pipeline as REST. |
| SR-8.3   | MCP server MUST bind to localhost in development; production requires authenticated transport. |

## SR-9: Supply Chain

| ID       | Requirement |
|----------|-------------|
| SR-9.1   | Dependencies MUST be pinned in lockfile; no floating version ranges in production. |
| SR-9.2   | CI MUST run `pnpm audit` and fail on critical vulnerabilities. |
| SR-9.3   | Container images MUST be scanned before deployment. |

## Threat Model Summary

| Threat                          | Mitigation                              |
|---------------------------------|-----------------------------------------|
| Unrestricted AI agent actions   | Policy engine + deny-by-default         |
| Credential exfiltration         | Filesystem/secret manager, no log leaks |
| Audit tampering                 | Append-only storage, DB permissions     |
| Privilege escalation            | RBAC + separate approver identity       |
| Replay attacks                  | Correlation IDs + idempotency keys      |
| MCP tool abuse                  | Auth + policy on every tool invocation  |

## SR-10: Data Provenance & Real-Data-First

| ID       | Requirement |
|----------|-------------|
| SR-10.1  | Every data record MUST include `source_type` (`REAL_FIREBLOCKS`, `CUSTOMER_SYSTEM`, `MARKET_DATA`, `DERIVED_AI`, `DEMO_SEED`). |
| SR-10.2  | Production MUST NOT serve `DEMO_SEED` data. Startup fails if `DEMO_MODE=true` or Fireblocks credentials missing in real mode. |
| SR-10.3  | The system MUST NOT silently fall back from real mode to demo data. Unavailable API data returns explicit "data unavailable". |
| SR-10.4  | UI MUST visibly label data provenance on all displayed records. |
| SR-10.5  | AI answers in real mode MUST only use records with `source_type: REAL_FIREBLOCKS`. |
| SR-10.6  | Hybrid mode mocked fields MUST be listed in `provenance.mocked_fields`. |
| SR-10.7  | Transaction execution MUST remain disabled; draft preparation only (`DERIVED_AI`). |
| SR-10.8  | All Fireblocks reads MUST use `@fireblocks/ts-sdk` via `@taicc/fireblocks-client`. |

## Compliance Mapping

| Control Area        | Framework Reference        |
|---------------------|----------------------------|
| Access control      | SOC 2 CC6.1, ISO 27001 A.9  |
| Audit logging       | SOC 2 CC7.2, ISO 27001 A.12 |
| Encryption          | SOC 2 CC6.7, ISO 27001 A.10 |
| Change management   | SOC 2 CC8.1                 |
| Incident response   | SOC 2 CC7.3, ISO 27001 A.16 |
