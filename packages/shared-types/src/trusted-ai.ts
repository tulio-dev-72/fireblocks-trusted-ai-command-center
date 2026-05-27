import { z } from "zod";
import { EvidenceItemSchema, ProvenanceMetadataSchema } from "./provenance.js";

export const CitationSchema = z.object({
  id: z.string(),
  evidence_id: z.string(),
  label: z.string(),
  excerpt: z.string(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const AiAskRequestSchema = z.object({
  question: z.string().min(1),
  workflow: z.string().optional(),
});
export type AiAskRequest = z.infer<typeof AiAskRequestSchema>;

export const InstitutionalAnalysisSchema = z.object({
  summary: z.string(),
  operational_impact: z.string(),
  root_cause: z.string(),
  evidence: z.string(),
  recommended_action: z.string(),
  audit_reference: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  missing_evidence: z.array(z.string()).default([]),
});
export type InstitutionalAnalysis = z.infer<typeof InstitutionalAnalysisSchema>;

export const AiAskResponseSchema = z.object({
  question: z.string(),
  answer: z.string(),
  summary: z.string(),
  analysis: InstitutionalAnalysisSchema.optional(),
  citations: z.array(CitationSchema),
  evidence: z.array(EvidenceItemSchema),
  model_provider: z.string(),
  model_id: z.string(),
  prompt_logged: z.boolean(),
  rbac_enforced: z.boolean(),
  provenance: ProvenanceMetadataSchema,
  correlation_id: z.string().uuid(),
  audit_event_id: z.string().uuid(),
});
export type AiAskResponse = z.infer<typeof AiAskResponseSchema>;

export const TrustControlStatusSchema = z.enum([
  "active",
  "enforced",
  "disabled",
  "warning",
]);
export type TrustControlStatus = z.infer<typeof TrustControlStatusSchema>;

export const TrustControlSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: TrustControlStatusSchema,
  description: z.string(),
  detail: z.string().optional(),
});
export type TrustControl = z.infer<typeof TrustControlSchema>;

export const TrustCenterStatusSchema = z.object({
  model_provider: z.string(),
  model_id: z.string(),
  prompt_logging: TrustControlSchema,
  data_provenance: TrustControlSchema,
  rbac_enforcement: TrustControlSchema,
  fireblocks_execution_boundary: TrustControlSchema,
  human_approval_requirement: TrustControlSchema,
  no_training_statement: TrustControlSchema,
  audit_trail: TrustControlSchema,
  controls: z.array(TrustControlSchema),
  data_mode: z.string(),
  correlation_id: z.string().uuid(),
});
export type TrustCenterStatus = z.infer<typeof TrustCenterStatusSchema>;

export const EscalationSummaryRequestSchema = z.object({
  correlation_id: z.string().uuid(),
  investigation_summary: z.string().optional(),
});
export type EscalationSummaryRequest = z.infer<
  typeof EscalationSummaryRequestSchema
>;

export const EscalationSummaryResponseSchema = z.object({
  title: z.string(),
  summary: z.string(),
  delayed_count: z.number(),
  top_reasons: z.array(z.string()),
  recommended_actions: z.array(z.string()),
  evidence_refs: z.array(z.string()),
  prepared_at: z.string().datetime(),
  correlation_id: z.string().uuid(),
  audit_event_id: z.string().uuid(),
  draft_only: z.literal(true),
});
export type EscalationSummaryResponse = z.infer<
  typeof EscalationSummaryResponseSchema
>;
