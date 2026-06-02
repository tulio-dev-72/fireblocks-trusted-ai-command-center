# MCP servers (Fireblocks + AI agents)

This repo connects AI clients (Cursor, Claude Desktop, etc.) to Fireblocks over the
[Model Context Protocol](https://modelcontextprotocol.io) using **three** servers. The first two
are **official Fireblocks** servers and are the recommended path; the third is a thin,
app-integrated server kept for audit-logged reads that flow through this repo's data layer.

| Server | Source | Transport | Scope | Use it for |
|--------|--------|-----------|-------|------------|
| `fireblocks-docs` | Official — Documentation MCP | HTTP | Read-only docs | Grounding your agent in current Fireblocks docs |
| `fireblocks` | Official — AI Link (Local), `@fireblocks/mcp-server` | stdio | Live workspace data (read-only by default) | Natural-language access to vaults, balances, transactions |
| `fireblocks-trusted-ai` | This repo — `apps/mcp-server` | stdio | Read-only via `@taicc/data-layer` | Reads that also write to the Postgres audit store and honor demo / hybrid / real data modes |

Copy the combined example and adjust paths/keys:

```bash
cp config/mcp.cursor.example.json .cursor/mcp.json
```

---

## 1. Fireblocks Documentation MCP (install first)

Gives your coding agent real-time access to Fireblocks developer docs. No credentials.

Cursor / any MCP client (`.cursor/mcp.json`):

```json
{ "mcpServers": { "fireblocks-docs": { "url": "https://developers.fireblocks.com/mcp" } } }
```

Claude Code:

```bash
claude mcp add --transport http fireblocks-docs https://developers.fireblocks.com/mcp
```

---

## 2. Fireblocks AI Link — Local MCP (`@fireblocks/mcp-server`)

The official open-source server that connects agents to your **live** Fireblocks workspace.
Read-only by default; write operations (e.g. `create_transaction`) require an explicit opt-in.
This is the recommended replacement for a hand-rolled Fireblocks data MCP.

```json
{
  "mcpServers": {
    "fireblocks": {
      "command": "npx",
      "args": ["-y", "@fireblocks/mcp-server"],
      "env": {
        "FIREBLOCKS_API_KEY": "your-sandbox-api-key",
        "FIREBLOCKS_PRIVATE_KEY_PATH": "/abs/path/to/fireblocks_secret.key",
        "ENABLE_WRITE_OPERATIONS": "false",
        "FIREBLOCKS_API_BASE_URL": "https://sandbox-api.fireblocks.io/v1"
      }
    }
  }
}
```

- Keep `ENABLE_WRITE_OPERATIONS=false` unless you explicitly need transaction creation from the agent.
- Use the sandbox base URL above for this project; production is `https://api.fireblocks.io/v1`.

---

## 3. App-integrated MCP (`apps/mcp-server`) — optional

A thin stdio JSON-RPC server that exposes the same read-only Fireblocks data **through this repo's
`@taicc/data-layer`**, so every tool call is recorded in the Postgres audit store and honors the
`DEMO_MODE` / `HYBRID_MODE` / `REAL_FIREBLOCKS` data routing the rest of the platform uses. Prefer
the official AI Link (Local) server above for raw workspace data; use this one when you want those
app-specific guarantees (audit trail + demo modes).

### Tools (read-only)

| Tool | Description |
|------|-------------|
| `list_vault_accounts` | Vault accounts |
| `get_vault_account` | Single vault by ID |
| `list_transactions` | Transaction history |
| `get_transaction` | Transaction by ID |
| `list_wallets` | External wallets |
| `get_active_policy` | Active policy rules |
| `list_activity_logs` | Fireblocks activity logs |
| `get_connection_status` | Sandbox connectivity check |

Transaction draft, submit, sign, and approval tools are **disabled** (same execution boundary as the REST API).

### Build + config

```bash
pnpm install
pnpm turbo run build --filter=@taicc/mcp-server
```

```json
{
  "mcpServers": {
    "fireblocks-trusted-ai": {
      "command": "node",
      "args": [
        "-r",
        "/path/to/fireblocks-trusted-ai-command-center/scripts/load-env.cjs",
        "/path/to/fireblocks-trusted-ai-command-center/apps/mcp-server/dist/index.js"
      ],
      "env": { "NODE_ENV": "development" }
    }
  }
}
```

`load-env.cjs` reads `.env.local` from the repo root so you do not paste secrets into the MCP config.

### Verify

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  node -r ./scripts/load-env.cjs apps/mcp-server/dist/index.js
```

You should see a JSON response with the tool list.

---

## Notes

- None of the stdio MCP servers are deployed to Vercel/Render/Railway — MCP is a local developer integration spawned by your IDE.
- The app-integrated server inherits `REAL_FIREBLOCKS=true` fail-closed behavior from `@taicc/config`, and logs tool calls to the Postgres audit store when `AUDIT_STORE=postgres`.
- Do not commit `.cursor/mcp.json` if it contains inline secrets.
