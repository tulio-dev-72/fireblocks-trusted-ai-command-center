import type { EnvConfig } from "@taicc/config";
import { resolveDataMode } from "@taicc/config";
import type { DataService } from "@taicc/data-layer";
import type {
  SandboxDataReadiness,
  TransactionRecord,
  ProvenanceMetadata,
} from "@taicc/shared-types";
import {
  SANDBOX_ACTIVITY_GUIDANCE,
  SANDBOX_NO_TRANSACTIONS_MESSAGE,
} from "@taicc/shared-types";
import type { FireblocksCallContext } from "@taicc/fireblocks-client";

const FINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "REJECTED", "BLOCKED"]);

function isNonFinal(tx: TransactionRecord): boolean {
  return !FINAL_STATUSES.has(tx.status);
}

function countBalancesWithFunds(
  balances: Array<{ available?: string; total?: string }>,
): number {
  return balances.filter((b) => {
    const available = b.available != null ? parseFloat(b.available) : NaN;
    const total = b.total != null ? parseFloat(b.total) : NaN;
    return (!Number.isNaN(available) && available > 0) || (!Number.isNaN(total) && total > 0);
  }).length;
}

function latestTransactionTimestamp(transactions: TransactionRecord[]): string | undefined {
  let latest: number | undefined;
  for (const tx of transactions) {
    const ts = tx.createdAt ?? tx.lastUpdated;
    if (ts != null && (latest == null || ts > latest)) {
      latest = ts;
    }
  }
  return latest != null ? new Date(latest).toISOString() : undefined;
}

function mergeProvenance(sources: ProvenanceMetadata[]): ProvenanceMetadata {
  const primary = sources.find((p) => p.source_type === "REAL_FIREBLOCKS") ?? sources[0];
  return {
    source_type: primary?.source_type ?? "REAL_FIREBLOCKS",
    fetched_at: new Date().toISOString(),
    api_endpoint: "GET /v1/fireblocks/sandbox-readiness (aggregated)",
    workspace_id: primary?.workspace_id,
    mocked_fields: [],
    correlation_id: primary?.correlation_id,
  };
}

export async function buildSandboxDataReadiness(
  config: EnvConfig,
  dataService: DataService,
  ctx: FireblocksCallContext,
): Promise<SandboxDataReadiness> {
  const checkedAt = new Date().toISOString();
  const dataMode = dataService.getMode();
  const verification = dataService.getConnectionVerification();
  const health = await verification.getHealth(ctx);
  const sandboxMode = health.sandbox_mode;
  const errors: string[] = [];

  if (dataMode === "demo") {
    return {
      checked_at: checkedAt,
      data_mode: dataMode,
      sandbox_mode: sandboxMode,
      connected: false,
      investigation_ready: false,
      provenance: {
        source_type: "DEMO_SEED",
        fetched_at: checkedAt,
        api_endpoint: "N/A — demo mode",
        mocked_fields: [],
        correlation_id: ctx.correlationId,
      },
      metrics: {
        vault_count: null,
        external_wallet_count: null,
        balance_lines_available: null,
        balances_with_funds: null,
        transaction_count: null,
        non_final_transaction_count: null,
        failed_transaction_count: null,
        pending_approval_count: null,
      },
      availability: {
        vaults: false,
        wallets: false,
        balances: false,
        transactions: false,
        approvals: false,
      },
      readiness_summary:
        "Demo mode active — sandbox readiness requires REAL_FIREBLOCKS with live sandbox credentials.",
      empty_state_message: SANDBOX_NO_TRANSACTIONS_MESSAGE,
      sandbox_activity_guidance: SANDBOX_ACTIVITY_GUIDANCE,
      errors: ["DEMO_MODE=true — no live Fireblocks metrics available"],
    };
  }

  if (!health.connected) {
    return {
      checked_at: checkedAt,
      data_mode: dataMode,
      sandbox_mode: sandboxMode,
      connected: false,
      investigation_ready: false,
      provenance: mergeProvenance(health.credential_checks.map(() => ({
        source_type: "REAL_FIREBLOCKS" as const,
        fetched_at: checkedAt,
        mocked_fields: [],
      }))),
      metrics: {
        vault_count: null,
        external_wallet_count: null,
        balance_lines_available: null,
        balances_with_funds: null,
        transaction_count: null,
        non_final_transaction_count: null,
        failed_transaction_count: null,
        pending_approval_count: null,
      },
      availability: {
        vaults: false,
        wallets: false,
        balances: false,
        transactions: false,
        approvals: false,
      },
      readiness_summary: "Fireblocks sandbox is not connected — cannot assess data readiness.",
      sandbox_activity_guidance: SANDBOX_ACTIVITY_GUIDANCE,
      errors: health.error ? [health.error] : ["Fireblocks connection failed"],
    };
  }

  const [vaults, wallets, balances, transactions, approvals] = await Promise.all([
    dataService.listVaultAccounts(ctx),
    dataService.listExternalWallets(ctx),
    dataService.listBalances(ctx),
    dataService.listTransactions(ctx),
    dataService.listApprovals(ctx),
  ]);

  const provenanceSources = [
    vaults.provenance,
    wallets.provenance,
    balances.provenance,
    transactions.provenance,
    approvals.provenance,
  ];

  if (!vaults.available && vaults.unavailable_reason) errors.push(vaults.unavailable_reason);
  if (!wallets.available && wallets.unavailable_reason) errors.push(wallets.unavailable_reason);
  if (!balances.available && balances.unavailable_reason) errors.push(balances.unavailable_reason);
  if (!transactions.available && transactions.unavailable_reason) {
    errors.push(transactions.unavailable_reason);
  }
  if (!approvals.available && approvals.unavailable_reason) errors.push(approvals.unavailable_reason);

  const txList = transactions.available && transactions.data ? transactions.data : [];
  const balanceList = balances.available && balances.data ? balances.data : [];
  const approvalList = approvals.available && approvals.data ? approvals.data : [];

  const metrics = {
    vault_count: vaults.available ? (vaults.data?.length ?? 0) : null,
    external_wallet_count: wallets.available ? (wallets.data?.length ?? 0) : null,
    balance_lines_available: balances.available ? balanceList.length : null,
    balances_with_funds: balances.available ? countBalancesWithFunds(balanceList) : null,
    transaction_count: transactions.available ? txList.length : null,
    non_final_transaction_count: transactions.available
      ? txList.filter(isNonFinal).length
      : null,
    failed_transaction_count: transactions.available
      ? txList.filter((tx) => tx.status === "FAILED").length
      : null,
    pending_approval_count: approvals.available ? approvalList.length : null,
    last_transaction_at: transactions.available ? latestTransactionTimestamp(txList) : undefined,
  };

  const lastSuccessfulSync = verification.getLastSuccessfulCallAt();

  const hasTransactions = transactions.available && txList.length > 0;
  const investigationReady =
    resolveDataMode(config) === "real" &&
    !config.DEMO_MODE &&
    vaults.available &&
    transactions.available &&
    hasTransactions;

  let readinessSummary: string;
  let emptyStateMessage: string | undefined;

  if (!transactions.available) {
    readinessSummary = "Transaction history could not be retrieved from Fireblocks sandbox.";
    emptyStateMessage = SANDBOX_NO_TRANSACTIONS_MESSAGE;
  } else if (txList.length === 0) {
    readinessSummary =
      "Fireblocks sandbox is connected but contains no transaction history yet.";
    emptyStateMessage = SANDBOX_NO_TRANSACTIONS_MESSAGE;
  } else if (investigationReady) {
    readinessSummary = `Sandbox has ${txList.length} transaction(s) and ${vaults.data?.length ?? 0} vault account(s) — sufficient for operational investigations.`;
  } else {
    readinessSummary = "Partial sandbox data available — review metrics below.";
  }

  return {
    checked_at: checkedAt,
    data_mode: dataMode,
    sandbox_mode: sandboxMode,
    connected: health.connected,
    investigation_ready: investigationReady,
    last_successful_sync: lastSuccessfulSync,
    provenance: mergeProvenance(provenanceSources),
    metrics,
    availability: {
      vaults: vaults.available,
      wallets: wallets.available,
      balances: balances.available,
      transactions: transactions.available,
      approvals: approvals.available,
    },
    readiness_summary: readinessSummary,
    empty_state_message: emptyStateMessage,
    sandbox_activity_guidance: SANDBOX_ACTIVITY_GUIDANCE,
    errors,
  };
}
