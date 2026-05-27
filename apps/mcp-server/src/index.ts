/**
 * MCP Server — read-only Fireblocks data tools via data layer.
 * Transaction execution is disabled; draft preparation only.
 */
import { createInterface } from "node:readline";
import { loadConfig, resolveDataMode } from "@taicc/config";
import { AuditLogger, InMemoryAuditStore } from "@taicc/audit";
import { createFireblocksClient } from "@taicc/fireblocks-client";
import { createDataService } from "@taicc/data-layer";
import { createLogger, generateCorrelationId } from "@taicc/observability";

const config = loadConfig();
const logger = createLogger("mcp-server", config.LOG_LEVEL);
const dataMode = resolveDataMode(config);

const auditLogger = new AuditLogger(new InMemoryAuditStore());
const fireblocksClient = createFireblocksClient(
  {
    apiKey: config.FIREBLOCKS_API_KEY ?? "",
    secretKeyPath: config.FIREBLOCKS_SECRET_KEY_PATH,
    basePath: config.FIREBLOCKS_BASE_PATH,
    workspaceId: config.FIREBLOCKS_WORKSPACE_ID,
  },
  auditLogger,
);
const dataService = createDataService(config, fireblocksClient);

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
    name: "prepare_transaction_draft",
    description: "Prepare a transaction draft locally (NOT submitted to Fireblocks)",
    inputSchema: {
      type: "object",
      properties: {
        assetId: { type: "string" },
        amount: { type: "string" },
        sourceVaultId: { type: "string" },
        destinationVaultId: { type: "string" },
        note: { type: "string" },
      },
      required: ["assetId", "amount", "sourceVaultId", "destinationVaultId"],
    },
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
  const ctx = { correlationId, actorId: "mcp-client" };

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
    case "prepare_transaction_draft":
      result = dataService.prepareTransactionDraft(
        {
          assetId: args.assetId as string,
          amount: args.amount as string,
          sourceVaultId: args.sourceVaultId as string,
          destinationVaultId: args.destinationVaultId as string,
          note: args.note as string | undefined,
        },
        ctx,
      );
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
  tools: READ_ONLY_TOOLS.map((t) => t.name),
});
