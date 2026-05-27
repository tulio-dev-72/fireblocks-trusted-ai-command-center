import { z } from "zod";
import { CredentialCheckSchema } from "./connection.js";

export const PrivateKeyDiagnosticsSchema = z.object({
  loaded: z.boolean(),
  source: z.enum(["inline_env", "file", "none"]),
  file_path: z.string().optional(),
  format: z.enum(["pkcs8", "pkcs1", "unknown", "missing"]).optional(),
  key_type: z.string().optional(),
  line_count: z.number().optional(),
  has_literal_backslash_n: z.boolean().optional(),
  has_wrapped_quotes: z.boolean().optional(),
  rsa_signing_ok: z.boolean().optional(),
  errors: z.array(z.string()).default([]),
  remediation: z.string().optional(),
});
export type PrivateKeyDiagnostics = z.infer<typeof PrivateKeyDiagnosticsSchema>;

export const JwtPreviewSchema = z.object({
  valid_structure: z.boolean(),
  header: z.record(z.unknown()).optional(),
  payload: z.record(z.unknown()).optional(),
  segment_count: z.number(),
  algorithm: z.string().optional(),
  uri_signed: z.string().optional(),
  sub_preview: z.string().optional(),
  iat: z.number().optional(),
  exp: z.number().optional(),
  ttl_seconds: z.number().optional(),
  body_hash: z.string().optional(),
  nonce_present: z.boolean().optional(),
  error: z.string().optional(),
});
export type JwtPreview = z.infer<typeof JwtPreviewSchema>;

export const SignedRequestPreviewSchema = z.object({
  method: z.string(),
  url: z.string(),
  uri_signed_in_jwt: z.string(),
  authorization_header_format: z.string(),
  x_api_key_present: z.boolean(),
  x_api_key_preview: z.string().optional(),
  jwt_segment_count: z.number(),
  authorization_malformed: z.boolean(),
});
export type SignedRequestPreview = z.infer<typeof SignedRequestPreviewSchema>;

export const FireblocksAuthTestResultSchema = z.object({
  ok: z.boolean(),
  http_status: z.number().optional(),
  latency_ms: z.number().optional(),
  response_body_preview: z.string().optional(),
  error: z.string().optional(),
});
export type FireblocksAuthTestResult = z.infer<typeof FireblocksAuthTestResultSchema>;

export const FireblocksAuthDiagnosticsSchema = z.object({
  checked_at: z.string().datetime(),
  sandbox_connectivity: z.enum(["ok", "failed", "skipped"]),
  private_key: PrivateKeyDiagnosticsSchema,
  jwt_generation: z.object({
    ok: z.boolean(),
    message: z.string(),
    preview: JwtPreviewSchema.optional(),
  }),
  environment: z.object({
    api_key_present: z.boolean(),
    api_key_preview: z.string().optional(),
    base_path: z.string(),
    base_path_valid: z.boolean(),
    secret_key_path: z.string().optional(),
    inline_key_configured: z.boolean(),
  }),
  signed_request: SignedRequestPreviewSchema.optional(),
  auth_test: FireblocksAuthTestResultSchema,
  credential_checks: z.array(CredentialCheckSchema).default([]),
  auth_log: z.array(
    z.object({
      phase: z.enum(["jwt_generation", "signing", "request", "response"]),
      status: z.enum(["ok", "failed", "skipped"]),
      detail: z.string(),
      at: z.string().datetime(),
    }),
  ),
  /** App-level API auth hint — separate from Fireblocks JWT */
  app_api_auth: z
    .object({
      bearer_configured: z.boolean(),
      bearer_format: z.enum(["jwt", "viewer_token", "dev", "missing", "invalid"]),
      note: z.string().optional(),
    })
    .optional(),
});
export type FireblocksAuthDiagnostics = z.infer<typeof FireblocksAuthDiagnosticsSchema>;
