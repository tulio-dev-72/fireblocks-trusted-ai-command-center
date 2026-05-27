import type {
  VaultAccountRecord,
  ExternalWalletRecord,
  TransactionRecord,
  FireblocksPolicyRuleRecord,
  ApprovalWorkflowRecord,
  WebhookEventRecord,
  CounterpartyRecord,
  ActivityLogRecord,
  ProvenanceRecord,
  TransactionDraft,
  BalanceRecord,
} from "@taicc/shared-types";
import { demoProvenance, availableRecord, wrapList } from "./provenance.js";

const SEED_VAULTS: VaultAccountRecord[] = [
  {
    id: "demo-vault-1",
    name: "Demo Treasury Vault",
    hiddenOnUI: false,
    autoFuel: false,
    assets: [
      { id: "BTC", total: "2.50000000", available: "2.50000000" },
      { id: "ETH", total: "45.00000000", available: "40.00000000" },
    ],
  },
  {
    id: "demo-vault-2",
    name: "Demo Operations Vault",
    assets: [{ id: "USDC", total: "1000000.00", available: "950000.00" }],
  },
];

const SEED_WALLETS: ExternalWalletRecord[] = [
  {
    id: "demo-ext-1",
    name: "Demo External Wallet",
    customerRefId: "CUST-001",
    assets: [{ id: "ETH", total: "10.0", available: "10.0" }],
  },
];

const SEED_TRANSACTIONS: TransactionRecord[] = [
  {
    id: "demo-tx-1",
    status: "COMPLETED",
    assetId: "BTC",
    amount: 0.5,
    note: "Demo seed transaction — not real",
    createdAt: Date.now() - 86400000,
  },
  {
    id: "demo-tx-2",
    status: "PENDING_AML_SCREENING",
    assetId: "ETH",
    amount: 12,
    note: "Demo pending transaction",
    createdAt: Date.now() - 3600000,
  },
];

const SEED_POLICIES: FireblocksPolicyRuleRecord[] = [
  {
    id: "demo-policy-1",
    name: "Demo: Deny withdrawals over $10k",
    type: "TRANSFER",
    action: "REQUIRE_APPROVAL",
  },
];

const SEED_APPROVALS: ApprovalWorkflowRecord[] = [
  {
    id: "demo-approval-1",
    status: "PENDING",
    operation: "TRANSFER",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  },
];

const SEED_WEBHOOKS: WebhookEventRecord[] = [
  {
    id: "demo-wh-1",
    type: "TRANSACTION_STATUS_UPDATED",
    status: "DELIVERED",
    createdAt: new Date().toISOString(),
    resourceId: "demo-tx-1",
  },
];

const SEED_COUNTERPARTIES: CounterpartyRecord[] = [
  {
    id: "demo-cp-1",
    name: "Demo Counterparty Exchange",
    type: "EXCHANGE",
    status: "ACTIVE",
  },
];

const SEED_ACTIVITY: ActivityLogRecord[] = [
  {
    id: "demo-log-1",
    timestamp: new Date().toISOString(),
    user: "demo@example.com",
    action: "LOGIN",
    subject: "Console",
  },
];

export class DemoSeedAdapter {
  listVaultAccounts(): ProvenanceRecord<VaultAccountRecord[]> {
    return wrapList(SEED_VAULTS, demoProvenance("vault_accounts"));
  }

  getVaultAccount(id: string): ProvenanceRecord<VaultAccountRecord> {
    const account = SEED_VAULTS.find((v) => v.id === id);
    if (!account) {
      return {
        data: null,
        available: false,
        unavailable_reason: "Vault account not found in demo seed",
        provenance: demoProvenance("vault_accounts"),
      };
    }
    return availableRecord(account, demoProvenance(`vault_accounts/${id}`));
  }

  listExternalWallets(): ProvenanceRecord<ExternalWalletRecord[]> {
    return wrapList(SEED_WALLETS, demoProvenance("external_wallets"));
  }

  listTransactions(): ProvenanceRecord<TransactionRecord[]> {
    return wrapList(SEED_TRANSACTIONS, demoProvenance("transactions"));
  }

  getTransaction(id: string): ProvenanceRecord<TransactionRecord> {
    const tx = SEED_TRANSACTIONS.find((t) => t.id === id);
    if (!tx) {
      return {
        data: null,
        available: false,
        unavailable_reason: "Transaction not found in demo seed",
        provenance: demoProvenance("transactions"),
      };
    }
    return availableRecord(tx, demoProvenance(`transactions/${id}`));
  }

  getActivePolicy(): ProvenanceRecord<FireblocksPolicyRuleRecord[]> {
    return wrapList(SEED_POLICIES, demoProvenance("policy/active_policy"));
  }

  listApprovals(): ProvenanceRecord<ApprovalWorkflowRecord[]> {
    return wrapList(SEED_APPROVALS, demoProvenance("approvals"));
  }

  listWebhookEvents(): ProvenanceRecord<WebhookEventRecord[]> {
    return wrapList(SEED_WEBHOOKS, demoProvenance("webhooks/notifications"));
  }

  listCounterparties(): ProvenanceRecord<CounterpartyRecord[]> {
    return wrapList(SEED_COUNTERPARTIES, demoProvenance("network_connections"));
  }

  listActivityLogs(): ProvenanceRecord<ActivityLogRecord[]> {
    return wrapList(SEED_ACTIVITY, demoProvenance("management/audit_logs"));
  }

  listBalances(): ProvenanceRecord<BalanceRecord[]> {
    const balances = SEED_VAULTS.flatMap((v) =>
      v.assets.map((a) => ({
        vaultAccountId: v.id,
        vaultAccountName: v.name,
        assetId: a.id,
        total: a.total,
        available: a.available,
      })),
    );
    return wrapList(balances, demoProvenance("balances"));
  }

  prepareTransactionDraft(): ProvenanceRecord<TransactionDraft> {
    return {
      data: null,
      available: false,
      unavailable_reason:
        "Transaction drafts are not available in demo mode. Connect Fireblocks credentials.",
      provenance: demoProvenance("transactions/draft"),
    };
  }
}
