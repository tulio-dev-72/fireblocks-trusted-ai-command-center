# Fireblocks Sandbox Setup

Configure the Trusted AI Command Center to use **real Fireblocks sandbox data** — no synthetic data when `REAL_FIREBLOCKS=true`.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Fireblocks sandbox API key and private key (from [Fireblocks Sandbox Console](https://sandbox.fireblocks.io))

## 1. Place the Fireblocks private key

Save your Fireblocks API user private key to the repository root:

```bash
# From the Fireblocks console: Settings → API Users → your user → Generate API key
# Download the private key file and place it at:
./fireblocks_secret.key
```

The file must be PEM-encoded:

```
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
```

This path is gitignored — never commit it.

## 2. Configure `.env`

```bash
cp .env.example .env
```

Set these values in `.env`:

```env
# Real Fireblocks sandbox — required
DEMO_MODE=false
REAL_FIREBLOCKS=true
HYBRID_MODE=false

# Your sandbox API key (UUID from Fireblocks console)
FIREBLOCKS_API_KEY=your-sandbox-api-key-here

# Path to private key file (relative to repo root)
FIREBLOCKS_SECRET_KEY_PATH=./fireblocks_secret.key

# Fireblocks sandbox API base URL
FIREBLOCKS_BASE_PATH=https://sandbox-api.fireblocks.io/v1

# Optional: workspace ID shown in Fireblocks console
FIREBLOCKS_WORKSPACE_ID=

# Optional: webhook ID for webhook event retrieval
FIREBLOCKS_WEBHOOK_ID=
```

The application **refuses to start** in real mode if credentials are missing or invalid. It never silently falls back to demo data.

## 3. Install and run locally

```bash
pnpm install
pnpm dev
```

| Service        | URL                          |
|----------------|------------------------------|
| API Gateway    | http://localhost:3001        |
| Command Center | http://localhost:5173        |

`pnpm dev` builds all packages first, then starts API + Command Center + MCP server.

## 4. Test Fireblocks connectivity

### Health endpoint (no auth)

```bash
curl http://localhost:3001/health/fireblocks | jq
```

Expected when connected:

```json
{
  "status": "ok",
  "connected": true,
  "sandbox_mode": true,
  "data_mode": "real",
  "api_latency_ms": 450,
  "message": "Connected to Fireblocks sandbox"
}
```

Expected when credentials are wrong:

```json
{
  "status": "failed",
  "connected": false,
  "credential_checks": [
    { "check": "api_key", "valid": false, "message": "..." }
  ],
  "error": "api_key: FIREBLOCKS_API_KEY is missing or empty"
}
```

### Full connection status (authenticated)

```bash
curl -H "Authorization: Bearer dev-token" \
  http://localhost:3001/v1/fireblocks/connection-status | jq
```

Shows credential validation, endpoint probes, latency per endpoint, and sandbox mode.

### Live data endpoints

```bash
# Vault accounts + balances
curl -H "Authorization: Bearer dev-token" http://localhost:3001/v1/vault-accounts | jq

# Transaction history
curl -H "Authorization: Bearer dev-token" http://localhost:3001/v1/transactions | jq

# Approval queue (derived from pending transactions)
curl -H "Authorization: Bearer dev-token" http://localhost:3001/v1/approvals | jq

# Policy rules
curl -H "Authorization: Bearer dev-token" http://localhost:3001/v1/policies | jq
```

Every response includes `provenance.source_type: "REAL_FIREBLOCKS"`.

## 5. Treasury workflow

In the Command Center UI, open **Treasury** and click **Analyze** with:

> Why are these payments delayed?

Or via API:

```bash
curl -X POST http://localhost:3001/v1/treasury/analyze \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"question":"Why are these payments delayed?"}' | jq
```

The system retrieves live sandbox transactions, approval queue, and balances, then returns a `DERIVED_AI` analysis with evidence references.

## Security constraints

| Allowed | Blocked |
|---------|---------|
| Read vault accounts, wallets, balances | Transaction execution |
| Read transaction history & status | Signing |
| Read policy, approvals, audit logs | Approvals / co-signer actions |
| Prepare transaction drafts (local only) | Submitting drafts to Fireblocks |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `FIREBLOCKS_API_KEY is missing` | Set `FIREBLOCKS_API_KEY` in `.env` |
| `Private key file not found` | Place key at `FIREBLOCKS_SECRET_KEY_PATH` |
| `JWT signing validation failed` | Ensure PEM key is valid RSA private key |
| `Unable to reach any Fireblocks endpoints` | Verify API key is paired with the private key in sandbox console |
| `403 from Fireblocks` | Check API user has read permissions for vaults/transactions |
| App won't start | Ensure `DEMO_MODE=false` and `REAL_FIREBLOCKS=true` with valid credentials |

## Demo mode (UI only, no Fireblocks)

For UI development without credentials:

```env
DEMO_MODE=true
REAL_FIREBLOCKS=false
```

All data is labeled `DEMO_SEED`. Treasury analysis and AI answers are disabled.
