import { z } from "zod";
import { DelayedPaymentsInvestigationResponseSchema } from "./workflows.js";

export const InvestigationModeSchema = z.enum([
  "treasury",
  "risk",
  "compliance",
  "operations",
  "executive",
]);
export type InvestigationMode = z.infer<typeof InvestigationModeSchema>;

export const InvestigationWorkflowSchema = z.enum([
  "delayed_payments_investigator",
]);
export type InvestigationWorkflow = z.infer<typeof InvestigationWorkflowSchema>;

export const StartInvestigationRequestSchema = z.object({
  question: z.string().min(1),
  workflow: InvestigationWorkflowSchema.default("delayed_payments_investigator"),
  mode: InvestigationModeSchema.default("operations"),
});
export type StartInvestigationRequest = z.infer<typeof StartInvestigationRequestSchema>;

export const InvestigationStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
]);
export type InvestigationStatus = z.infer<typeof InvestigationStatusSchema>;

export const StartInvestigationResponseSchema = z.object({
  correlation_id: z.string().uuid(),
  status: InvestigationStatusSchema,
  workflow: InvestigationWorkflowSchema,
  mode: InvestigationModeSchema,
  question: z.string(),
  started_at: z.string().datetime(),
  poll: z.object({
    status: z.string(),
    events: z.string(),
  }),
});
export type StartInvestigationResponse = z.infer<typeof StartInvestigationResponseSchema>;

export const InvestigationRecordSchema = z.object({
  correlation_id: z.string().uuid(),
  workflow: InvestigationWorkflowSchema,
  mode: InvestigationModeSchema,
  question: z.string(),
  status: InvestigationStatusSchema,
  phase: z.string().optional(),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  error: z.string().optional(),
  result: DelayedPaymentsInvestigationResponseSchema.optional(),
});
export type InvestigationRecord = z.infer<typeof InvestigationRecordSchema>;

export const AuditTimelineEventSchema = z.object({
  id: z.string().uuid(),
  event_type: z.string(),
  action: z.string().optional(),
  outcome: z.string(),
  timestamp: z.string().datetime(),
  label: z.string(),
  detail: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type AuditTimelineEvent = z.infer<typeof AuditTimelineEventSchema>;
