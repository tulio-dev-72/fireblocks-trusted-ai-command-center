# System Architecture

This document describes **what is implemented** in this repository. Items marked **Planned** are not wired in the current codebase.

## Overview

The Trusted AI Command Center is a read-only operational layer between AI interfaces (REST API, MCP, web UI) and the Fireblocks API. It enforces RBAC, logs audit events, filters evidence before LLM calls, and orchestrates treasury investigation workflows without transaction execution.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AI Interfaces                                │
│   MCP (read-only tools)  │  REST API  │  Command Center Web UI      │
└──────────────┬──────────────────────────┬───────────────┬───────────┘
               │                          │               │
               ▼                          ▼               ▼
┌──────────────────────┐    ┌─────────────────────────────────────────┐
│    MCP Server        │    │           API (apps/api)                  │
│  (Local AI Link)     │───▶│  JWT Auth → RBAC → Audit → Data Layer    │
└──────────────────────┘    └──────────────┬──────────────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
            ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
            │ RBAC         │      │  Audit Log   │      │ Trusted AI   │
            │ (implemented)│      │ (Postgres)   │      │ workflows    │
            └──────────────┘      └──────────────┘      └──────────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │     Data Layer         │
                              │  REAL_FIREBLOCKS mode  │
                              │  + Provenance metadata │
                              └────────────┬───────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │  Fireblocks Client     │
                              │  (@fireblocks/ts-sdk)  │
                              │  Read-only             │
                              └────────────┬───────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │  Fireblocks Sandbox    │
                              │  (live API)            │
                              └────────────────────────┘
```

## Request Flow (implemented)

Every authenticated API request follows:

1. **Authenticate** — Bearer JWT validation; non-production accepts configured dev token.
2. **Authorize (RBAC)** — permission check for resource/action; denied requests return 403 and log `rbac_filter`.
3. **Audit (request)** — `user_action` event per authenticated call.
4. **Data retrieval** — `DataService` routes to Fireblocks SDK when `REAL_FIREBLOCKS=true`.
5. **Evidence filter** — `filterForAi()` blocks non-REAL_FIREBLOCKS records before LLM context is built.
6. **LLM call** (workflows only) — OpenAI or Anthropic HTTP API, or local grounded synthesis when no provider key is configured.
7. **Audit (workflow)** — `evidence_retrieved`, `ai_prompt`, `ai_response`, `workflow_executed` with correlation ID.

Transaction submission and Fireblocks signing are **not implemented**. Draft preparation returns local records with `execution_disabled: true`.

## Components

### API (`apps/api`)

Primary REST interface. Implemented routes include:

| Endpoint | Purpose |
|----------|---------|
| `GET /health`, `/health/fireblocks` | Service and Fireblocks connectivity |
| `GET /v1/system/status` | Integration posture for UI |
| `GET /v1/data-mode` | Current data mode configuration |
| `GET /v1/vault-accounts`, `/balances`, `/transactions`, `/approvals`, `/policy`, … | Read-only Fireblocks data with provenance |
| `POST /v1/workflows/delayed-payments/investigate` | Delayed Payments Investigator |
| `POST /v1/workflows/delayed-payments/escalation-summary` | Prepare-only escalation draft |
| `POST /v1/ai/ask` | Evidence pipeline Q&A |
| `GET /v1/audit` | Query audit events by correlation ID |
| `GET /v1/trust/status` | Runtime trust control configuration |
| `POST /v1/transactions/draft` | Disabled — returns 403 EXECUTION_DISABLED |

**Planned:** `/v1/agents`, `/v1/operations`, policy CRUD on request path, OIDC auth.

### MCP Server (`apps/mcp-server`)

Implements the [Model Context Protocol](https://modelcontextprotocol.io) with read-only Fireblocks tools over **stdio** (local Cursor / Claude Desktop). Setup: [docs/MCP.md](../MCP.md).

**Planned:** Full RBAC parity with REST for all MCP tools.

### Web app (`apps/web`)

React operator UI for:

- Fireblocks sandbox data charts (from live API responses)
- Delayed Payments Investigator workflow
- Evidence library, Trust Center, Audit Log, Architecture reference

### Worker (`apps/worker`)

**Planned** — process stub only. No Redis queue, webhook ingestion, or approval timeout jobs are running.

## Data Stores

| Store | Status | Purpose |
|-------|--------|---------|
| Postgres (`audit_events`) | **Implemented** | Append-only audit log with immutability trigger |
| InMemoryAuditStore | **Test only** | Set `AUDIT_STORE=memory` for unit tests |
| Redis | **Planned** | Job queue, rate limiting |

## Deployment

- **Local**: `pnpm dev` — API on :3001, UI on :5173
- **Docker Compose** (`infra/docker/`): available for containerized local runs
- **Production Kubernetes** (`infra/k8s/`): **Planned** — manifests exist; mTLS and production hardening not validated in this repo

Secrets load from `.env` / `.env.local` locally. External secret manager integration is **Planned** for production.

## Fireblocks Integration (implemented)

1. **API Layer** — `@fireblocks/ts-sdk` with API key + RSA private key JWT signing
2. **Read paths** — vault accounts, transactions, balances, policy, approvals, audit logs, network connections
3. **Provenance** — every record tagged with `source_type: REAL_FIREBLOCKS` and API endpoint
4. **Execution boundary** — no signing, submission, or approval execution from this platform

**Planned:** webhook ingestion, co-signer integration, automated signing gated by local policy.

## AI Provider Abstraction (implemented)

- `resolveLlmConfig()` selects OpenAI, Anthropic, or local grounded synthesis
- Provider selected by `AI_PROVIDER` env and available API keys
- System prompt restricts answers to retrieved evidence context only
- Prompts logged to audit store when `AI_PROMPT_LOGGING=true`

## Policy Engine

The `@taicc/policy-engine` package exists but is **not wired** to the API request pipeline. RBAC is enforced; policy rule evaluation on each request is **Planned**.

## Data Layer

All Fireblocks-sourced data flows through `@taicc/data-layer`. See [DATA_LAYER.md](./DATA_LAYER.md).

- **Real mode** (`REAL_FIREBLOCKS=true`): live Fireblocks API data only; no silent demo fallback
- **Demo mode**: labeled `DEMO_SEED` data for local UI development
- **Hybrid mode**: real metadata with labeled mock fields

Transaction execution is disabled platform-wide.
