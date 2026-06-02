# Production deployment

Public deployment stack:

| Component | Provider | Repo path |
|-----------|----------|-----------|
| Web UI | [Vercel](https://vercel.com) | `apps/web` |
| API | [Render](https://render.com) | `apps/api` (Docker) |
| Postgres (audit) | [Neon](https://neon.tech) | managed |
| Redis | [Upstash](https://upstash.com) | managed |

MCP (`apps/mcp-server`) is **local only** (Cursor stdio). See [docs/MCP.md](./docs/MCP.md).

---

## Production safety (enforced in code)

| Requirement | How it is enforced |
|-------------|-------------------|
| No secrets in Git | `.env`, `.env.local`, `*.key`, `*.pem` gitignored |
| No secrets in frontend | Vercel gets **only** `VITE_*` vars; see `apps/web/.env.example` |
| Fireblocks key from backend env | Production requires `FIREBLOCKS_PRIVATE_KEY` (PEM in Render env, not file path) |
| `REAL_FIREBLOCKS=true` fail-closed | `validateProductionConfig()` + `validateDataMode()` block startup if credentials missing |
| No demo fallback | `DEMO_MODE` / `HYBRID_MODE` forbidden in production; real mode never routes to seed data |
| Read-only Fireblocks | SDK wrapper exposes list/get only; no submit/sign/approve |
| No transaction execution | `execution-boundary.ts` returns `403 EXECUTION_DISABLED` on draft/submit/sign/approval routes |
| Production CORS | Exactly one origin via `PUBLIC_FRONTEND_URL` (your Vercel URL) |
| Health checks | `/health`, `/health/ready`, `/v1/status`, `/v1/fireblocks/connection` |
| Public UI banner | “Sandbox environment. Read-only. No transaction execution.” |

---

## Prerequisites

- Node **20+** (see `.nvmrc`)
- GitHub repo connected to Vercel and Render
- Fireblocks **sandbox** API key + matching RSA private key

---

## 1. Neon (Postgres)

1. Create a project at [console.neon.tech](https://console.neon.tech).
2. Create a database (e.g. `taicc`).
3. Copy the **pooled** connection string: `postgresql://…?sslmode=require`.
4. Save as `DATABASE_URL` — **Render only**, never Vercel.

On first API deploy with `AUDIT_BOOTSTRAP_SCHEMA=true`, the append-only `audit_events` table is created automatically (Neon SSL is handled in `@taicc/audit`).

---

## 2. Upstash (Redis)

1. Create a Redis database at [console.upstash.com](https://console.upstash.com).
2. Copy the URL (`rediss://…` recommended).
3. Save as `REDIS_URL` on Render.

---

## 3. Render (API)

### Option A — Blueprint (recommended)

1. Push this repo to GitHub.
2. Render → **New** → **Blueprint** → connect the repo.
3. Render reads [`render.yaml`](./render.yaml) and creates the `taicc-api` Docker web service.
4. In the Render dashboard, set secrets marked `sync: false`:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Neon pooled URL |
| `JWT_SECRET` | Random string ≥ 32 characters |
| `API_VIEWER_TOKEN` | Random string ≥ 32 characters — same value as `VITE_API_TOKEN` on Vercel |
| `FIREBLOCKS_API_KEY` | Fireblocks sandbox API key |
| `FIREBLOCKS_PRIVATE_KEY` | Full PEM (`\n` for newlines in dashboard) |
| `PUBLIC_FRONTEND_URL` | `https://your-app.vercel.app` (no trailing slash) |
| `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` | At least one required |
| `REDIS_URL` | Upstash URL |

5. Deploy. Render health check: **`/health/ready`**.

### Option B — Manual Docker service

| Setting | Value |
|---------|-------|
| Environment | Docker |
| Dockerfile path | `apps/api/Dockerfile` |
| Docker context | `.` (repo root) |
| Health check path | `/health/ready` |

**Full production env (Render dashboard):**

```bash
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=3001
DEMO_MODE=false
REAL_FIREBLOCKS=true
HYBRID_MODE=false
AUDIT_STORE=postgres
AUDIT_BOOTSTRAP_SCHEMA=true
DATABASE_URL=postgresql://…neon…?sslmode=require
JWT_SECRET=<32+ char secret>
FIREBLOCKS_API_KEY=<sandbox key>
FIREBLOCKS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"
FIREBLOCKS_BASE_PATH=https://sandbox-api.fireblocks.io/v1
PUBLIC_FRONTEND_URL=https://your-app.vercel.app
REDIS_URL=rediss://…upstash…
OPENAI_API_KEY=sk-…          # or ANTHROPIC_API_KEY
AI_PROVIDER=auto
```

**Do not set on Render:** any `VITE_*` variable.

Note the API URL after deploy (e.g. `https://taicc-api.onrender.com`).

### Health endpoints (public, no auth)

| Path | Purpose |
|------|---------|
| `GET /health` | Liveness |
| `GET /health/ready` | Readiness — Postgres + Fireblocks |
| `GET /v1/status` | Integration status |
| `GET /v1/fireblocks/connection` | Fireblocks connectivity |

Render and the Docker `HEALTHCHECK` both use `/health/ready`.

---

## 4. Vercel (web)

1. [vercel.com/new](https://vercel.com/new) → import GitHub repo.
2. **Root Directory:** `apps/web`.
3. Framework: **Vite** (or use included [`apps/web/vercel.json`](./apps/web/vercel.json)).
4. **Production environment variables:**

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | Render API URL (e.g. `https://taicc-api.onrender.com`) |
| `VITE_API_TOKEN` | Same value as Render `API_VIEWER_TOKEN` (read-only dashboard auth) |

5. Deploy. Copy the Vercel URL (e.g. `https://taicc-web.vercel.app`).

6. **Back on Render:** set `PUBLIC_FRONTEND_URL` to that exact Vercel URL → **Redeploy API**.

**Never set on Vercel:**

`FIREBLOCKS_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`

---

## 5. Post-deploy verification

```bash
API=https://taicc-api.onrender.com

curl -s "$API/health" | jq .
curl -s "$API/health/ready" | jq .
curl -s "$API/v1/status" | jq .
curl -s "$API/v1/fireblocks/connection" | jq .

# Execution boundary — must return 403
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/v1/transactions/draft" \
  -H "Content-Type: application/json" -d '{}'
```

Open the Vercel URL — confirm the security banner and live sandbox data.

---

## 6. Local development vs production

| Setting | Local | Production |
|---------|-------|------------|
| `NODE_ENV` | `development` | `production` |
| Fireblocks key | `FIREBLOCKS_SECRET_KEY_PATH=./fireblocks_secret.key` OK | `FIREBLOCKS_PRIVATE_KEY` env only |
| CORS | `API_CORS_ORIGINS=http://localhost:5173` | `PUBLIC_FRONTEND_URL` = Vercel URL |
| Auth | `dev-token` accepted | `API_VIEWER_TOKEN` or platform JWT |
| Audit | Postgres (Docker) or `AUDIT_STORE=memory` (tests) | `postgres` only |
| Demo mode | optional for UI-only dev | **forbidden** |

Local setup: copy `.env.example` → `.env` / `.env.local`. Browser vars: `apps/web/.env.example`.

```bash
nvm use          # Node 20
pnpm install
pnpm verify              # 13/13 connectivity checks
pnpm fireblocks:whoami   # confirm Fireblocks auth via the official CLI
pnpm dev                 # API :3001, web :5173
```

### Fireblocks CLI

The official `@fireblocks/fireblocks-cli` is wired in (devDependency). `scripts/fireblocks-cli.mjs`
loads this repo's `.env` / `.env.local` and maps the credential conventions
(`FIREBLOCKS_PRIVATE_KEY` / `FIREBLOCKS_SECRET_KEY_PATH` / `FIREBLOCKS_BASE_PATH`) onto the CLI's
env names, so every command runs against the sandbox with no extra setup:

```bash
pnpm fireblocks whoami                                  # verify credentials authenticate
pnpm fireblocks vaults get-paged-vault-accounts --json  # read vault accounts
pnpm fireblocks help-index                              # full command catalog (LLM-friendly)
pnpm fireblocks transactions create-transaction --data '{...}' --dry-run  # preview a write
```

`pnpm fireblocks:test-auth` now runs the official CLI's `whoami`. The richer hand-rolled PEM/JWT
diagnostics remain available as `pnpm fireblocks:test-auth:diagnostics` for deeper debugging.

---

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| API crashes on boot | Render logs — check JWT, Neon URL, Fireblocks PEM, LLM key, Redis, `PUBLIC_FRONTEND_URL` |
| CORS errors in browser | `PUBLIC_FRONTEND_URL` must exactly match Vercel origin (scheme + host, no path) |
| Fireblocks signature error | `FIREBLOCKS_PRIVATE_KEY` must pair with `FIREBLOCKS_API_KEY`; use `\n` escapes |
| Postgres SSL error | Use Neon URL with `sslmode=require` |
| 401 / "Malformed JWT" from web | Set `VITE_API_TOKEN` = Render `API_VIEWER_TOKEN`. This is app auth, not Fireblocks JWT. |
| Fireblocks JWT debug | `pnpm fireblocks:whoami` (official CLI), `pnpm fireblocks:test-auth:diagnostics` (deep PEM/JWT), or UI **FB Auth Diagnostics** / `GET /health/fireblocks/auth-diagnostics` |
| Port in use locally | Kill stale `node` on :3001 / :5173, restart `pnpm dev` |

---

## Repo deployment files

| File | Purpose |
|------|---------|
| [`render.yaml`](./render.yaml) | Render Blueprint for API |
| [`apps/api/Dockerfile`](./apps/api/Dockerfile) | Production API image |
| [`apps/web/vercel.json`](./apps/web/vercel.json) | Vercel monorepo build |
| [`apps/web/.env.example`](./apps/web/.env.example) | Browser-safe env vars only |
| [`.env.example`](./.env.example) | Backend env reference |
