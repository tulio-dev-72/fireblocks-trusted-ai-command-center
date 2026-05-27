# Data Layer Architecture

## Overview

The data layer (`@taicc/data-layer`) is the single routing point for all Fireblocks-sourced data. Applications never call Fireblocks directly — they use `DataService`, which selects the correct adapter based on environment configuration.

```
┌─────────────────────────────────────────────────────────────┐
│  API / MCP / Command Center / AI                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  DataService (mode router — no silent fallback)             │
│  ┌─────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ DemoSeed    │  │ FireblocksReal   │  │ Hybrid        │  │
│  │ Adapter     │  │ Adapter          │  │ Adapter       │  │
│  └─────────────┘  └────────┬─────────┘  └───────┬───────┘  │
└─────────────────────────────┼────────────────────┼──────────┘
                                │                    │
                                ▼                    ▼
                    ┌───────────────────────────────────────┐
                    │  @taicc/fireblocks-client             │
                    │  Official @fireblocks/ts-sdk          │
                    │  Read-only + draft preparation        │
                    └───────────────────┬───────────────────┘
                                        │
                                        ▼
                    ┌───────────────────────────────────────┐
                    │  Fireblocks Platform API              │
                    └───────────────────────────────────────┘
```

## Data Modes

### Mode 1: Real Fireblocks

```
DEMO_MODE=false
REAL_FIREBLOCKS=true
HYBRID_MODE=false
```

- All reads go to Fireblocks APIs via official SDK.
- Failed API calls return `{ available: false, unavailable_reason: "..." }` — never synthetic substitutes.
- Production **fails closed** at startup if credentials are missing.
- AI answers may only use records with `source_type: REAL_FIREBLOCKS`.

### Mode 2: Demo Seed

```
DEMO_MODE=true
REAL_FIREBLOCKS=false
HYBRID_MODE=false
```

- All data from `DemoSeedAdapter` with `source_type: DEMO_SEED`.
- Forbidden in `NODE_ENV=production`.
- AI context is disabled (`filterForAi` returns unavailable).

### Mode 3: Hybrid

```
DEMO_MODE=false
REAL_FIREBLOCKS=true
HYBRID_MODE=true
```

- Primary reads from Fireblocks APIs.
- When real data is unavailable, returns "data unavailable" — **never** silently substitutes demo seed.
- Fields that are enriched locally are listed in `provenance.mocked_fields`.

## Provenance Model

Every response from the data layer is a `ProvenanceRecord<T>`:

```typescript
{
  data: T | null,
  available: boolean,
  unavailable_reason?: string,
  provenance: {
    source_type: "REAL_FIREBLOCKS" | "CUSTOMER_SYSTEM" | "MARKET_DATA" | "DERIVED_AI" | "DEMO_SEED",
    fetched_at: string,       // ISO 8601
    api_endpoint?: string,    // e.g. "GET /vault/accounts_paged"
    workspace_id?: string,
    mocked_fields: string[],  // hybrid mode only
    correlation_id?: string,
  }
}
```

## Fireblocks Data Sources

| Resource | SDK Method | Endpoint |
|----------|-----------|----------|
| Vault accounts | `vaults.getPagedVaultAccounts` | `GET /vault/accounts_paged` |
| Vault account | `vaults.getVaultAccount` | `GET /vault/accounts/{id}` |
| External wallets | `externalWallets.getExternalWallets` | `GET /external_wallets` |
| Transactions | `transactions.getTransactions` | `GET /transactions` |
| Transaction status | `transactions.getTransaction` | `GET /transactions/{id}` |
| Policy rules | `policyEditorV2Beta.getActivePolicy` | `GET /policy/active_policy` |
| Activity logs | `auditLogs.getAuditLogs` | `GET /management/audit_logs` |
| Webhook events | `webhooksV2.getNotifications` | `GET /webhooks/{id}/notifications` |
| Counterparties | `networkConnections.getNetworkConnections` | `GET /network_connections` |
| Transaction draft | Local only | `POST /v1/transactions/draft` |

### Unavailable by design

- **Approval workflow**: no dedicated Fireblocks list endpoint; returns unavailable with guidance to query pending transactions.
- **Webhook events**: requires `FIREBLOCKS_WEBHOOK_ID` configuration.

## Transaction Execution Policy

Transaction **execution is disabled** across all modes:

- `FireblocksClient` exposes read methods and `prepareTransactionDraft()` only.
- Drafts have `source_type: DERIVED_AI` and `execution_disabled: true`.
- MCP server exposes `prepare_transaction_draft`, not `create_transaction`.
- No code path calls `transactions.createTransaction`.

## AI Data Policy

When `REAL_FIREBLOCKS=true`:

- `DataService.filterForAi()` passes only `REAL_FIREBLOCKS` records to AI context.
- Demo seed and unavailable records are excluded.
- Evidence panel lists `ai_eligible_sources: ["REAL_FIREBLOCKS"]`.

When demo or hybrid without real data:

- AI context returns unavailable with explicit reason.

## Environment Validation

`validateDataMode()` in `@taicc/config` enforces:

1. `DEMO_MODE=true` forbidden in production.
2. `HYBRID_MODE=true` forbidden in production.
3. Real mode in production requires Fireblocks API key + secret key file.
4. `DEMO_MODE` and `HYBRID_MODE` cannot both be true.
5. `DEMO_MODE=true` requires `REAL_FIREBLOCKS=false`.
