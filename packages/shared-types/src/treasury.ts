import { z } from "zod";
import { EvidenceItemSchema } from "./provenance.js";
import { ProvenanceMetadataSchema } from "./provenance.js";

export const TreasuryAnalysisRequestSchema = z.object({
  question: z.string().min(1),
});
export type TreasuryAnalysisRequest = z.infer<typeof TreasuryAnalysisRequestSchema>;

export const TreasuryRecommendationSchema = z.object({
  priority: z.enum(["high", "medium", "low"]),
  action: z.string(),
  rationale: z.string(),
});
export type TreasuryRecommendation = z.infer<typeof TreasuryRecommendationSchema>;

export const TreasuryAnalysisResponseSchema = z.object({
  question: z.string(),
  summary: z.string(),
  explanation: z.string(),
  delayed_payment_count: z.number(),
  pending_approval_count: z.number(),
  evidence: z.array(EvidenceItemSchema),
  recommendations: z.array(TreasuryRecommendationSchema),
  provenance: ProvenanceMetadataSchema,
  correlation_id: z.string().uuid(),
});
export type TreasuryAnalysisResponse = z.infer<typeof TreasuryAnalysisResponseSchema>;

export const BalanceRecordSchema = z.object({
  vaultAccountId: z.string(),
  vaultAccountName: z.string(),
  assetId: z.string(),
  total: z.string().optional(),
  available: z.string().optional(),
});
export type BalanceRecord = z.infer<typeof BalanceRecordSchema>;
