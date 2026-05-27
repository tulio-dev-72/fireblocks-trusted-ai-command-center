import { z } from "zod";
import { DataModeSchema, ProvenanceMetadataSchema } from "./provenance.js";

export const SandboxReadinessMetricsSchema = z.object({
  vault_count: z.number().nullable(),
  external_wallet_count: z.number().nullable(),
  balance_lines_available: z.number().nullable(),
  balances_with_funds: z.number().nullable(),
  transaction_count: z.number().nullable(),
  non_final_transaction_count: z.number().nullable(),
  failed_transaction_count: z.number().nullable(),
  pending_approval_count: z.number().nullable(),
  last_transaction_at: z.string().datetime().optional(),
});
export type SandboxReadinessMetrics = z.infer<typeof SandboxReadinessMetricsSchema>;

export const SandboxDataReadinessSchema = z.object({
  checked_at: z.string().datetime(),
  data_mode: DataModeSchema,
  sandbox_mode: z.boolean(),
  connected: z.boolean(),
  investigation_ready: z.boolean(),
  last_successful_sync: z.string().datetime().optional(),
  provenance: ProvenanceMetadataSchema,
  metrics: SandboxReadinessMetricsSchema,
  availability: z.object({
    vaults: z.boolean(),
    wallets: z.boolean(),
    balances: z.boolean(),
    transactions: z.boolean(),
    approvals: z.boolean(),
  }),
  readiness_summary: z.string(),
  empty_state_message: z.string().optional(),
  sandbox_activity_guidance: z.array(z.string()),
  errors: z.array(z.string()).default([]),
});
export type SandboxDataReadiness = z.infer<typeof SandboxDataReadinessSchema>;

export const SANDBOX_NO_TRANSACTIONS_MESSAGE =
  "No Fireblocks sandbox transactions available. Create sandbox test activity to enable operational investigations.";

export const SANDBOX_ACTIVITY_GUIDANCE = [
  "In the Fireblocks sandbox console, submit test transfers between vault accounts using sandbox test assets (e.g. ETH_TEST5, USDC test tokens).",
  "Use the Fireblocks sandbox faucet or test-net funding tools to add balance to vault accounts before transferring.",
  "Configure approval policies in sandbox if you need PENDING_AUTHORIZATION states for approval-queue testing.",
  "This platform is read-only — it retrieves and analyzes Fireblocks records but never submits or signs transactions from AI workflows.",
];
