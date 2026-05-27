import { z } from "zod";

export const ActorTypeSchema = z.enum(["human", "agent", "service"]);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const ActorSchema = z.object({
  id: z.string().uuid(),
  type: ActorTypeSchema,
  name: z.string().min(1),
  roles: z.array(z.string()).default([]),
});
export type Actor = z.infer<typeof ActorSchema>;

export const PolicyActionSchema = z.enum(["allow", "deny", "require_approval"]);
export type PolicyAction = z.infer<typeof PolicyActionSchema>;

export const PolicyRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  version: z.number().int().positive(),
  enabled: z.boolean().default(true),
  priority: z.number().int().default(100),
  conditions: z.object({
    resourceTypes: z.array(z.string()).optional(),
    actions: z.array(z.string()).optional(),
    maxAmountUsd: z.number().positive().optional(),
    allowedDestinations: z.array(z.string()).optional(),
    agentIds: z.array(z.string().uuid()).optional(),
    timeWindowUtc: z
      .object({ start: z.string(), end: z.string() })
      .optional(),
  }),
  action: PolicyActionSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const PolicyDecisionSchema = z.object({
  allowed: z.boolean(),
  action: PolicyActionSchema,
  matchedRuleId: z.string().uuid().optional(),
  matchedRuleVersion: z.number().int().optional(),
  reason: z.string(),
  requiresApproval: z.boolean().default(false),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const OperationStatusSchema = z.enum([
  "pending",
  "pending_approval",
  "approved",
  "denied",
  "executing",
  "completed",
  "failed",
]);
export type OperationStatus = z.infer<typeof OperationStatusSchema>;

export const OperationSchema = z.object({
  id: z.string().uuid(),
  correlationId: z.string().uuid(),
  actorId: z.string().uuid(),
  agentId: z.string().uuid().optional(),
  resourceType: z.string(),
  action: z.string(),
  payload: z.record(z.unknown()),
  status: OperationStatusSchema,
  policyDecision: PolicyDecisionSchema.optional(),
  fireblocksTxId: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Operation = z.infer<typeof OperationSchema>;

export const ApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "expired",
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRequestSchema = z.object({
  id: z.string().uuid(),
  operationId: z.string().uuid(),
  requestedBy: z.string().uuid(),
  status: ApprovalStatusSchema,
  approverId: z.string().uuid().optional(),
  reason: z.string().optional(),
  expiresAt: z.string().datetime(),
  decidedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const AuditEventTypeSchema = z.enum([
  "auth",
  "policy_evaluation",
  "operation_created",
  "operation_executed",
  "approval_requested",
  "approval_decided",
  "fireblocks_api_call",
  "ai_prompt",
  "ai_response",
  "evidence_retrieved",
  "rbac_filter",
  "user_action",
  "connection_verification",
  "sandbox_activity",
  "workflow_executed",
  "escalation_prepared",
  "webhook_ingested",
  "worker_job",
  "error",
]);
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;

export const AuditEventSchema = z.object({
  id: z.string().uuid(),
  correlationId: z.string().uuid(),
  eventType: AuditEventTypeSchema,
  actorId: z.string().uuid().optional(),
  resourceType: z.string().optional(),
  action: z.string().optional(),
  outcome: z.enum(["success", "failure", "denied"]),
  metadata: z.record(z.unknown()).default({}),
  timestamp: z.string().datetime(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const AgentCapabilitySchema = z.enum([
  "read_balances",
  "read_transactions",
  "create_transaction",
  "manage_vaults",
]);
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

export const AgentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  capabilities: z.array(AgentCapabilitySchema),
  enabled: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const CreateOperationRequestSchema = z.object({
  resourceType: z.string().min(1),
  action: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  agentId: z.string().uuid().optional(),
  idempotencyKey: z.string().optional(),
});
export type CreateOperationRequest = z.infer<typeof CreateOperationRequestSchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  correlationId: z.string().uuid().optional(),
  details: z.record(z.unknown()).optional(),
});
export * from "./provenance.js";
export * from "./connection.js";
export * from "./fireblocks-data.js";
export * from "./treasury.js";
export * from "./trusted-ai.js";
export * from "./workflows.js";
export * from "./system-status.js";
export * from "./system-actors.js";
export * from "./fireblocks-auth.js";
export * from "./sandbox-readiness.js";
export * from "./sandbox-activity.js";
export * from "./agents.js";
export * from "./investigations.js";
