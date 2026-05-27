import { z } from "zod";
import { InvestigationTransparencySchema } from "./evidence-transparency.js";
import { EvidenceItemSchema, ProvenanceMetadataSchema } from "./provenance.js";
import { CitationSchema } from "./trusted-ai.js";
import { TreasuryRecommendationSchema } from "./treasury.js";

export const DelayReasonSchema = z.enum([
  "approval_pending",
  "policy_blocked",
  "insufficient_balance",
  "failed_transfer",
  "network_delay",
]);
export type DelayReason = z.infer<typeof DelayReasonSchema>;

export const DelayReasonLabels: Record<DelayReason, string> = {
  approval_pending: "Approval Pending",
  policy_blocked: "Policy / Compliance Block",
  insufficient_balance: "Insufficient Balance",
  failed_transfer: "Failed Transfer",
  network_delay: "Network / Confirmation Delay",
};

export const DelayedTransactionGroupSchema = z.object({
  reason: DelayReasonSchema,
  label: z.string(),
  count: z.number(),
  transaction_ids: z.array(z.string()),
  summary: z.string(),
});
export type DelayedTransactionGroup = z.infer<
  typeof DelayedTransactionGroupSchema
>;

export const EvidenceCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  reason: DelayReasonSchema.optional(),
  transaction_id: z.string().optional(),
  status: z.string().optional(),
  amount: z.string().optional(),
  asset: z.string().optional(),
  evidence_id: z.string(),
  provenance: ProvenanceMetadataSchema,
  vault_id: z.string().optional(),
  source_vault_id: z.string().optional(),
  destination_id: z.string().optional(),
  timestamp: z.string().datetime().optional(),
  approval_state: z.string().optional(),
  policy_reference: z.string().optional(),
  webhook_event_id: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type EvidenceCard = z.infer<typeof EvidenceCardSchema>;

export const DelayedPaymentsInvestigationRequestSchema = z.object({
  question: z.string().min(1).default("Why are these payments delayed?"),
});
export type DelayedPaymentsInvestigationRequest = z.infer<
  typeof DelayedPaymentsInvestigationRequestSchema
>;

export const DelayedPaymentsInvestigationResponseSchema = z.object({
  workflow: z.literal("delayed_payments_investigator"),
  question: z.string(),
  summary: z.string(),
  ai_answer: z.string(),
  explanation: z.string(),
  analysis: z
    .object({
      summary: z.string(),
      operational_impact: z.string(),
      root_cause: z.string(),
      evidence: z.string(),
      recommended_action: z.string(),
      audit_reference: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
      missing_evidence: z.array(z.string()).default([]),
    })
    .optional(),
  delay_groups: z.array(DelayedTransactionGroupSchema),
  evidence_cards: z.array(EvidenceCardSchema),
  evidence: z.array(EvidenceItemSchema),
  citations: z.array(CitationSchema),
  recommendations: z.array(TreasuryRecommendationSchema),
  delayed_payment_count: z.number(),
  pending_approval_count: z.number(),
  model_provider: z.string(),
  model_id: z.string(),
  prompt_logged: z.boolean(),
  rbac_enforced: z.boolean(),
  provenance: ProvenanceMetadataSchema,
  correlation_id: z.string().uuid(),
  audit_event_id: z.string().uuid(),
  transparency: InvestigationTransparencySchema.optional(),
});
export type DelayedPaymentsInvestigationResponse = z.infer<
  typeof DelayedPaymentsInvestigationResponseSchema
>;
