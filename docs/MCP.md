# MCP server (read-only Fireblocks tools)

The MCP server (`apps/mcp-server`) exposes **read-only** Fireblocks data to AI clients (Cursor, Claude Desktop, etc.) via the [Model Context Protocol](https://modelcontextprotocol.io).

It is **not** deployed to Vercel, Render, or Railway. MCP uses **stdio** (stdin/stdout JSON-RPC): your IDE spawns the process locally and talks to it over pipes. That is the standard MCP transport for desktop agents.

Cloud deployment targets in [DEPLOYMENT.md](../DEPLOYMENT.md) are:

| Service | Where it runs |
|---------|----------------|
| Web UI | Vercel |
| REST API | Render / Railway |
| Postgres | Neon |
| Redis | Upstash |
| **MCP** | **Your machine** (spawned by Cursor) |

The MCP server loads the **same backend secrets** as the API (Fireblocks, Postgres, LLM keys) from `.env.local` — never from the browser.

---

## Tools (read-only)

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

---

## Prerequisites

1. Repo cloned and dependencies installed: `pnpm install`
2. `.env.local` configured (see [SETUP.md](./SETUP.md)) with Fireblocks sandbox credentials
3. MCP package built: `pnpm turbo run build --filter=@taicc/mcp-server`

---

## Cursor configuration

Copy the example and adjust the absolute path to your clone:

```bash
cp config/mcp.cursor.example.json .cursor/mcp.json
# Edit .cursor/mcp.json — replace /path/to/fireblocks-trusted-ai-command-center
```

Or add manually in **Cursor Settings → MCP → Add server**:

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
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

`load-env.cjs` reads `.env.local` from the repo root so you do not paste secrets into the MCP config.

Restart Cursor after saving. The server appears as **fireblocks-trusted-ai** with the tools listed above.

---

## Claude Desktop (optional)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "fireblocks-trusted-ai": {
      "command": "node",
      "args": [
        "-r",
        "/path/to/fireblocks-trusted-ai-command-center/scripts/load-env.cjs",
        "/path/to/fireblocks-trusted-ai-command-center/apps/mcp-server/dist/index.js"
      ]
    }
  }
}
```

---

## Verify

```bash
pnpm turbo run build --filter=@taicc/mcp-server

# Smoke test (one JSON-RPC line in, one line out)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  node -r ./scripts/load-env.cjs apps/mcp-server/dist/index.js
```

You should see a JSON response with the tool list.

---

## Production / remote API

For a **public** deployment, operators use the **Vercel web UI** and **REST API** on Render/Railway. MCP remains a **local developer integration** unless you add a separate HTTP/SSE MCP transport (not implemented in this repo).

To point MCP at production Postgres audit while running locally, set `DATABASE_URL` in `.env.local` to your Neon URL. Fireblocks and LLM keys stay in `.env.local` only — never in Cursor project settings or Git.

---

## Security notes

- MCP inherits `REAL_FIREBLOCKS=true` fail-closed behavior from `@taicc/config`.
- All tool calls log to the Postgres audit store when `AUDIT_STORE=postgres`.
- Do not commit `.cursor/mcp.json` if it contains inline secrets (the example uses `load-env.cjs` instead).
