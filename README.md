# Fireblocks Trusted AI Command Center

Enterprise monorepo for a **trusted AI operational platform** integrated with Fireblocks infrastructure. The platform is **real-data-first**: production pulls live data from Fireblocks APIs; demo seed data is isolated to local UI development only.

## Data Modes

| Mode | Env flags | Behavior |
|------|-----------|----------|
| **Real** | `DEMO_MODE=false` `REAL_FIREBLOCKS=true` | All data from Fireblocks APIs. No synthetic values. Fails closed if credentials missing in production. |
| **Demo** | `DEMO_MODE=true` `REAL_FIREBLOCKS=false` | Labeled `DEMO_SEED` data for local UI only. Never allowed in production. |
| **Hybrid** | `HYBRID_MODE=true` `REAL_FIREBLOCKS=true` | Real Fireblocks metadata where API access exists. Mocked fields explicitly labeled. Never silently falls back to demo. |

Every data record includes `source_type`:

- `REAL_FIREBLOCKS` — live Fireblocks API response
- `CUSTOMER_SYSTEM` — internal platform data (audit log, etc.)
- `MARKET_DATA` — external market feeds
- `DERIVED_AI` — AI-generated analysis (no transaction submission)
- `DEMO_SEED` — local development seed data

See [docs/architecture/DATA_LAYER.md](./docs/architecture/DATA_LAYER.md) for full details.

## Architecture Principles

1. **Real data first** — production never serves synthetic data.
2. **Provenance on every record** — UI and AI layers display `source_type`.
3. **Fail closed** — missing Fireblocks credentials block startup in production; unavailable API data returns "data unavailable", not invented values.
4. **Read-only Fireblocks** — transaction execution, signing, and approval routes disabled (`403 EXECUTION_DISABLED`).
5. **Security layer precedes capability layer** — policy evaluation before any action.

## Monorepo Structure

```
apps/
  api/               REST API — data layer, connection status, evidence panel
  web/               Operator dashboard (Vercel)
  mcp-server/        Read-only MCP tools backed by data layer
  worker/            Async jobs

packages/
  data-layer/        Real / demo / hybrid adapters + DataService router
  fireblocks-client/ Official @fireblocks/ts-sdk wrapper (read-only)
  shared-types/      Domain types + provenance schemas
  policy-engine/     Local policy evaluation
  audit/             Append-only audit log
  auth/              JWT/OIDC + RBAC
  config/            Validated env + data mode checks

docs/
  architecture/      System design + data layer spec
  security/          Security requirements
```

## Quick Start

**Full Fireblocks sandbox setup:** see [docs/SETUP.md](./docs/SETUP.md).

```bash
cp .env.example .env
# Add FIREBLOCKS_API_KEY and place fireblocks_secret.key — see SETUP.md

pnpm install
pnpm dev
```

| Service          | Port | Description                    |
|------------------|------|--------------------------------|
| API Gateway      | 3001 | REST API + data layer (local dev; override with `API_PORT`) |
| Web app          | 5173 | Dashboard, connection, evidence|
| MCP Server       | stdio| Read-only MCP tools            |

## Production deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for Vercel (web), Render/Railway (API), Neon (Postgres), and Upstash (Redis).

**MCP (local):** read-only Fireblocks tools for Cursor — see [docs/MCP.md](./docs/MCP.md). Not deployed to the cloud.

## Production analytics (Vercel)

The web app (`apps/web`) ships with Vercel Web Analytics, Speed Insights, and privacy-safe custom product events.

### Required packages

Installed in `@taicc/web`:

- `@vercel/analytics` — page views and custom events
- `@vercel/speed-insights` — Core Web Vitals (LCP, FID, CLS, etc.)

### Enable in Vercel dashboard

1. Open the Vercel project → **Analytics** → enable **Web Analytics**.
2. Open **Speed Insights** → enable for the production deployment.
3. Redeploy the web app after enabling (or use the next production deploy).

Traffic, page visits, and Web Vitals appear in the Vercel project dashboard once both features are enabled and the app is deployed.

### Where components are mounted

`Analytics` and `SpeedInsights` are mounted client-side in the SPA root:

- `apps/web/src/main.tsx` wraps `<App />` with `<AnalyticsProvider />`
- `apps/web/src/components/AnalyticsProvider.tsx` renders both Vercel components

### Custom product events

Event tracking lives in `apps/web/src/lib/analytics.ts` via `trackProductEvent()`.

Tracked events:

| Event | When |
|-------|------|
| `homepage_viewed` | Treasury Operations page |
| `architecture_page_viewed` | Architecture page |
| `operational_investigation_opened` | Delayed Payments investigator opened |
| `investigation_prompt_clicked` | Homepage prompt card selected |
| `ai_investigation_started` | Async investigation started |
| `ai_investigation_completed` | Investigation finished successfully |
| `evidence_card_opened` | Evidence card expanded in workspace |
| `fireblocks_connection_checked` | Fireblocks Link connection verified |
| `operational_data_readiness_viewed` | Operational Data Readiness page |
| `trust_center_viewed` | Trust Center page |

### Privacy rules

Custom events **never** include API keys, Fireblocks secrets, transaction payloads, wallet private data, or full AI prompts. Only safe metadata is sent (event name, page, timestamp, investigation mode, prompt ID slug, evidence category, connection status).

The in-app **Usage / Analytics** page (`Governance` menu) shows integration status, deployment metadata, tracked event names, and a session-local event log for operator visibility.

## API Endpoints (data)

| Endpoint | Description |
|----------|-------------|
| `GET /v1/data-mode` | Active data mode |
| `GET /v1/fireblocks/connection-status` | Connection health + reachable endpoints |
| `GET /v1/vault-accounts` | Vault accounts with provenance |
| `GET /v1/wallets` | External wallets |
| `GET /v1/transactions` | Transaction history |
| `GET /v1/policies` | Active Fireblocks policy |
| `GET /v1/approvals` | Approval workflow data |
| `GET /v1/webhooks/events` | Webhook notifications |
| `GET /v1/counterparties` | Network connections |
| `GET /v1/activity-logs` | Fireblocks audit logs |
| `GET /v1/evidence` | Evidence panel with provenance |
| `POST /v1/transactions/draft` | Disabled — returns 403 EXECUTION_DISABLED |

## Security

See [docs/security/REQUIREMENTS.md](./docs/security/REQUIREMENTS.md).

- Production refuses to start without Fireblocks credentials in real mode.
- No silent fallback from real to demo data.
- Transaction execution disabled; drafts are `DERIVED_AI` and never submitted.
- All Fireblocks calls go through `@taicc/fireblocks-client` with audit logging.

## Development

```bash
pnpm build       # Build all packages and apps
pnpm typecheck   # TypeScript validation
pnpm test        # Run test suites
```

## License

Proprietary — Fireblocks Trusted AI Command Center
