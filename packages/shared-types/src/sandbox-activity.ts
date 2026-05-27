import { z } from "zod";
import { ProvenanceMetadataSchema } from "./provenance.js";

export const SandboxActivityActionSchema = z.enum([
  "create_vault",
  "vault_to_vault_transfer",
  "list_vaults",
  "list_wallets",
  "list_balances",
]);
export type SandboxActivityAction = z.infer<typeof SandboxActivityActionSchema>;

export const SandboxActivityRequestSchema = z.object({
  /** Explicit human confirmation — required for API calls (never from AI) */
  human_confirmed: z.literal(true),
  create_vault: z.boolean().optional(),
  vault_name: z.string().min(1).max(120).optional(),
  transfer: z
    .object({
      source_vault_id: z.string().min(1),
      destination_vault_id: z.string().min(1),
      asset_id: z.string().min(1),
      amount: z.string().min(1),
      note: z.string().max(500).optional(),
    })
    .optional(),
  include_snapshot: z.boolean().optional(),
});
export type SandboxActivityRequest = z.infer<typeof SandboxActivityRequestSchema>;

export const SandboxActivityStepSchema = z.object({
  action: SandboxActivityActionSchema,
  ok: z.boolean(),
  detail: z.string(),
  resource_id: z.string().optional(),
  fireblocks_tx_id: z.string().optional(),
});
export type SandboxActivityStep = z.infer<typeof SandboxActivityStepSchema>;

export const SandboxActivityResultSchema = z.object({
  ok: z.boolean(),
  sandbox_only: z.literal(true),
  source_type: z.literal("REAL_FIREBLOCKS_SANDBOX"),
  provenance: ProvenanceMetadataSchema,
  steps: z.array(SandboxActivityStepSchema),
  vault_count: z.number().optional(),
  external_wallet_count: z.number().optional(),
  balance_line_count: z.number().optional(),
  errors: z.array(z.string()).default([]),
  message: z.string(),
});
export type SandboxActivityResult = z.infer<typeof SandboxActivityResultSchema>;

export const SandboxActivityCapabilitiesSchema = z.object({
  can_generate: z.boolean(),
  sandbox_only: z.boolean(),
  ai_execution_blocked: z.literal(true),
  reason: z.string().optional(),
});
export type SandboxActivityCapabilities = z.infer<
  typeof SandboxActivityCapabilitiesSchema
>;
