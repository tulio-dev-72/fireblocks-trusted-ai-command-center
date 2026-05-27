# System Architecture

## Overview

The Trusted AI Command Center is an operational control plane for AI agents interacting with Fireblocks digital asset infrastructure. It sits between AI interfaces (LLMs, MCP clients, automation) and the Fireblocks API, enforcing policy, capturing audit evidence, and orchestrating human approvals.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AI Interfaces                                │
│   ChatGPT / Claude / Cursor  │  Custom Agents  │  Command Center   │
└──────────────┬──────────────────────────┬───────────────┬───────────┘
               │ MCP                      │ REST          │ Web UI
               ▼                          ▼               ▼
┌──────────────────────┐    ┌─────────────────────────────────────────┐
│    MCP Server        │    │           API Gateway                   │
│  (Local AI Link)     │───▶│  Auth → Policy → Audit → Orchestrate    │
└──────────────────────┘    └──────────────┬──────────────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
            ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
            │ Policy Engine│      │  Audit Log   │      │   Worker     │
            │  (evaluate)  │      │ (append-only)│      │ (async jobs) │
            └──────────────┘      └──────────────┘      └──────────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │     Data Layer         │
                              │  Real / Demo / Hybrid  │
                              │  + Provenance on every │
                              │    record              │
                              └────────────┬───────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │  Fireblocks Client     │
                              │  (@fireblocks/ts-sdk)  │
                              │  Read-only + drafts    │
                              └────────────┬───────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │  Fireblocks Platform   │
                              │  Policy Engine / MPC   │
                              │  Co-signer / KYT       │
                              └────────────────────────┘
```

## Request Flow

Every operation follows the same trust path regardless of entry point:

1. **Authenticate** — JWT/OIDC validation; extract actor identity and roles.
2. **Authorize (RBAC)** — check role permissions for the requested resource/action.
3. **Evaluate Policy** — run workspace policy rules (spend limits, allowlists, time windows).
4. **Audit (pre-action)** — record intent, actor, policy decision, correlation ID.
5. **Approval Gate** — if policy requires human approval, enqueue and pause.
6. **Execute** — call Fireblocks API through the guarded client wrapper.
7. **Audit (post-action)** — record outcome, Fireblocks transaction ID, latency.
8. **Respond** — return structured result with audit reference.

## Components

### API Gateway (`apps/api`)

Primary REST interface. Exposes:

- `/v1/agents` — agent registration and capability management
- `/v1/operations` — submit and track AI-initiated operations
- `/v1/approvals` — human approval workflow
- `/v1/audit` — query audit trail (read-only, RBAC-scoped)
- `/v1/policies` — policy rule CRUD (admin only)
- `/health` — liveness/readiness probes

### MCP Server (`apps/mcp-server`)

Implements the [Model Context Protocol](https://modelcontextprotocol.io) for local AI Link-style integration. Exposes Fireblocks operations as MCP tools with the same policy/audit pipeline as the REST API.

Tools are read-only by default; write tools require explicit policy allow rules.

### Command Center (`apps/command-center`)

React operator dashboard for:

- Real-time operation monitoring
- Approval queue management
- Policy configuration
- Audit log search and export

### Worker (`apps/worker`)

Processes async jobs:

- Approval timeout and escalation
- Fireblocks webhook ingestion
- Audit log archival
- Policy cache invalidation

## Data Stores

| Store    | Purpose                                      |
|----------|----------------------------------------------|
| Postgres | Audit log, policies, approvals, agent registry |
| Redis    | Job queue, policy cache, rate limiting       |

## Deployment

- **Local**: Docker Compose (`infra/docker/`)
- **Production**: Kubernetes (`infra/k8s/`) with mTLS service mesh
- **Secrets**: External secret manager (Vault/AWS Secrets Manager) — never in-cluster ConfigMaps

## Integration with Fireblocks

The platform integrates with Fireblocks at three layers:

1. **API Layer** — REST SDK for vault accounts, transactions, assets
2. **Policy Layer** — workspace policy rules mirrored/enriched locally
3. **Co-signer Layer** — automated signing gated by local policy + Fireblocks MPC policy

See [Fireblocks Developer Docs](https://developers.fireblocks.com/) for API reference.

## Data Layer

All Fireblocks-sourced data flows through `@taicc/data-layer`. See [DATA_LAYER.md](./DATA_LAYER.md).

- **Real mode** (production): live Fireblocks API data only.
- **Demo mode** (local UI): labeled `DEMO_SEED` data, never in production.
- **Hybrid mode** (development): real metadata with labeled mock fields; no silent fallback.

Transaction execution is disabled platform-wide. Draft preparation returns `DERIVED_AI` provenance and is never submitted to Fireblocks.
