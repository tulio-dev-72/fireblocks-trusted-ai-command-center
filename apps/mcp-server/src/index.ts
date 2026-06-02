/**
 * App-integrated MCP server — read-only Fireblocks data tools via @taicc/data-layer.
 * Transaction execution, signing, and draft preparation are disabled.
 *
 * For raw live-workspace data, prefer the official Fireblocks AI Link (Local) MCP
 * (@fireblocks/mcp-server) and the Documentation MCP — see docs/MCP.md. This server
 * is kept for reads that must flow through this repo's audit pipeline and honor the
 * DEMO_MODE / HYBRID_MODE / REAL_FIREBLOCKS data routing.
 */
import { createInterface } from "node:readline";
import { loadConfig, resolveDataMode, buildFireblocksClientOptions } from "@taicc/config";
import { AuditLogger, createAuditLogger } from "@taicc/audit";
import { createFireblocksClient } from "@taicc/fireblocks-client";
import { createDataService } from "@taicc/data-layer";
import { createLogger, generateCorrelationId } from "@taicc/observability";
import { MCP_CLIENT_ACTOR_ID } from "@taicc/shared-types";

const config = loadConfig();
const logger = createLogger("mcp-server", config.LOG_LEVEL);
const dataMode = resolveDataMode(config);

let auditLogger!: AuditLogger;
let dataService!: ReturnType<typeof createDataService>;

async function bootstrapMcp(): Promise<() => Promise<void>> {
  const auditHandle = await createAuditLogger({
    databaseUrl: config.DATABASE_URL,
    store: config.AUDIT_STORE,
    bootstrap: config.AUDIT_BOOTSTRAP_SCHEMA,
  });
  auditLogger = auditHandle.logger;

  const fireblocksClient = createFireblocksClient(
    buildFireblocksClientOptions(config),
    auditLogger,
  );
  dataService = createDataService(config, fireblocksClient);
  return auditHandle.shutdown;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

const READ_ONLY_TOOLS = [
  {
    name: "list_vault_accounts",
    description: "List Fireblocks vault accounts (read-only, real data when REAL_FIREBLOCKS=true)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_vault_account",
    description: "Get a vault account by ID",
    inputSchema: {
      type: "object",
      properties: { vaultAccountId: { type: "string" } },
      required: ["vaultAccountId"],
    },
  },
  {
    name: "list_transactions",
    description: "List Fireblocks transaction history",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "get_transaction",
    description: "Get transaction status by ID",
    inputSchema: {
      type: "object",
      properties: { txId: { type: "string" } },
      required: ["txId"],
    },
  },
  {
    name: "list_wallets",
    description: "List external wallets",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_active_policy",
    description: "Get active Fireblocks policy rules",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_activity_logs",
    description: "Get Fireblocks management audit/activity logs",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_connection_status",
    description: "Check Fireblocks API connection status and reachable endpoints",
    inputSchema: { type: "object", properties: {} },
  },
];

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  correlationId: string,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const ctx = { correlationId, actorId: MCP_CLIENT_ACTOR_ID };

  let result: unknown;

  switch (name) {
    case "list_vault_accounts":
      result = await dataService.listVaultAccounts(ctx);
      break;
    case "get_vault_account":
      result = await dataService.getVaultAccount(args.vaultAccountId as string, ctx);
      break;
    case "list_transactions":
      result = await dataService.listTransactions(ctx);
      break;
    case "get_transaction":
      result = await dataService.getTransaction(args.txId as string, ctx);
      break;
    case "list_wallets":
      result = await dataService.listExternalWallets(ctx);
      break;
    case "get_active_policy":
      result = await dataService.getActivePolicy(ctx);
      break;
    case "list_activity_logs":
      result = await dataService.listActivityLogs(ctx);
      break;
    case "get_connection_status":
      result = await dataService.checkConnection(ctx);
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  const record = result as { available?: boolean; provenance?: { source_type?: string } };
  const aiFiltered = dataService.filterForAi(
    result as Parameters<typeof dataService.filterForAi>[0],
  );

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            data_mode: dataMode,
            result,
            ai_context: dataMode === "real" ? aiFiltered : {
              available: false,
              unavailable_reason: "AI context requires REAL_FIREBLOCKS mode",
            },
            source_type: record?.provenance?.source_type ?? "unknown",
            available: record?.available ?? true,
          },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleRequest(request: JsonRpcRequest): Promise<unknown> {
  const { id, method, params } = request;

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: config.MCP_SERVER_NAME,
            version: "0.2.0",
          },
          capabilities: { tools: {} },
        },
      };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: READ_ONLY_TOOLS },
      };

    case "tools/call": {
      const correlationId = generateCorrelationId();
      const toolName = params?.name as string;
      const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;
      const result = await handleToolCall(toolName, toolArgs, correlationId);
      return { jsonrpc: "2.0", id, result };
    }

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });

async function main(): Promise<void> {
  const shutdownAudit = await bootstrapMcp();

  rl.on("line", async (line) => {
    try {
      const request = JSON.parse(line) as JsonRpcRequest;
      const response = await handleRequest(request);
      process.stdout.write(JSON.stringify(response) + "\n");
    } catch (error) {
      logger.error("MCP request error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  logger.info("MCP server started (read-only)", {
    name: config.MCP_SERVER_NAME,
    dataMode,
    auditStore: config.AUDIT_STORE,
    tools: READ_ONLY_TOOLS.map((t) => t.name),
  });

  process.on("SIGINT", () => {
    shutdownAudit().finally(() => process.exit(0));
  });
}

main().catch((error) => {
  logger.error("MCP server failed to start", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
