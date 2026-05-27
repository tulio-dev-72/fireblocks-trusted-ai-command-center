import { z } from "zod";

export const IntegrationCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["connected", "degraded", "disconnected", "active", "inactive"]),
  detail: z.string(),
});
export type IntegrationCheck = z.infer<typeof IntegrationCheckSchema>;

export const FireblocksIntegrationDetailSchema = z.object({
  connected: z.boolean(),
  sandbox_mode: z.boolean(),
  jwt_signing_valid: z.boolean(),
  api_latency_ms: z.number().optional(),
  vault_account_count: z.number().optional(),
  balance_line_count: z.number().optional(),
  transaction_count: z.number().optional(),
  error: z.string().optional(),
});
export type FireblocksIntegrationDetail = z.infer<
  typeof FireblocksIntegrationDetailSchema
>;

export const SystemIntegrationStatusSchema = z.object({
  data_mode: z.string(),
  real_fireblocks: z.boolean(),
  demo_mode: z.boolean(),
  checks: z.array(IntegrationCheckSchema),
  fireblocks: FireblocksIntegrationDetailSchema,
  correlation_id: z.string().uuid(),
  checked_at: z.string().datetime(),
});
export type SystemIntegrationStatus = z.infer<typeof SystemIntegrationStatusSchema>;
