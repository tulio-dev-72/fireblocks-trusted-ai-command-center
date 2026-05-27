import { z } from "zod";
import { DataModeSchema } from "./provenance.js";

export const CredentialCheckSchema = z.object({
  check: z.enum([
    "api_key",
    "secret_key_path",
    "jwt_signing",
    "base_path",
  ]),
  valid: z.boolean(),
  message: z.string(),
});
export type CredentialCheck = z.infer<typeof CredentialCheckSchema>;

export const EndpointProbeSchema = z.object({
  name: z.string(),
  available: z.boolean(),
  latency_ms: z.number().optional(),
  error: z.string().optional(),
  source_type: z.literal("REAL_FIREBLOCKS").default("REAL_FIREBLOCKS"),
});
export type EndpointProbe = z.infer<typeof EndpointProbeSchema>;

export const FireblocksConnectionStatusSchema = z.object({
  connected: z.boolean(),
  mode: DataModeSchema,
  real_fireblocks_enabled: z.boolean(),
  demo_mode: z.boolean(),
  hybrid_mode: z.boolean(),
  sandbox_mode: z.boolean(),
  credentials_present: z.boolean(),
  secret_key_present: z.boolean(),
  base_path: z.string(),
  workspace_id: z.string().optional(),
  authenticated_workspace: z.string().optional(),
  api_latency_ms: z.number().optional(),
  last_checked_at: z.string().datetime(),
  last_successful_call_at: z.string().datetime().optional(),
  error: z.string().optional(),
  credential_checks: z.array(CredentialCheckSchema).default([]),
  reachable_endpoints: z.array(z.string()).default([]),
  unreachable_endpoints: z.array(z.string()).default([]),
  endpoint_probes: z.array(EndpointProbeSchema).default([]),
});
export type FireblocksConnectionStatus = z.infer<
  typeof FireblocksConnectionStatusSchema
>;

export const FireblocksHealthSchema = z.object({
  status: z.enum(["ok", "degraded", "failed"]),
  connected: z.boolean(),
  sandbox_mode: z.boolean(),
  data_mode: DataModeSchema,
  credential_checks: z.array(CredentialCheckSchema),
  api_latency_ms: z.number().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});
export type FireblocksHealth = z.infer<typeof FireblocksHealthSchema>;
