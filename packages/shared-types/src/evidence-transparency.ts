import { z } from "zod";

export const EvidenceSourceBreakdownSchema = z.object({
  REAL_FIREBLOCKS_SANDBOX: z.number().int().nonnegative().default(0),
  WEBHOOK_EVENTS: z.number().int().nonnegative().default(0),
  POLICY_RECORDS: z.number().int().nonnegative().default(0),
  APPROVAL_RECORDS: z.number().int().nonnegative().default(0),
  DERIVED_AI: z.number().int().nonnegative().default(0),
  DEMO_SEED: z.number().int().nonnegative().default(0),
});
export type EvidenceSourceBreakdown = z.infer<typeof EvidenceSourceBreakdownSchema>;

export const OperationalSeveritySchema = z.enum([
  "low_operational_risk",
  "moderate_approval_bottleneck",
  "elevated_settlement_latency",
  "critical_liquidity_constraint",
  "insufficient_evidence",
]);
export type OperationalSeverity = z.infer<typeof OperationalSeveritySchema>;

export const OperationalSeverityLabels: Record<OperationalSeverity, string> = {
  low_operational_risk: "Low Operational Risk",
  moderate_approval_bottleneck: "Moderate Approval Bottleneck",
  elevated_settlement_latency: "Elevated Settlement Latency",
  critical_liquidity_constraint: "Critical Liquidity Constraint",
  insufficient_evidence: "Insufficient Evidence — Partial Assessment",
};

export const EvidenceGraphNodeSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "transaction",
    "vault",
    "approval",
    "webhook",
    "policy",
    "finding",
  ]),
  label: z.string(),
  ref_id: z.string().optional(),
  source_type: z.string().optional(),
});
export type EvidenceGraphNode = z.infer<typeof EvidenceGraphNodeSchema>;

export const EvidenceGraphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  relation: z.string(),
});
export type EvidenceGraphEdge = z.infer<typeof EvidenceGraphEdgeSchema>;

export const InvestigationProvenanceSchema = z.object({
  model_provider: z.string(),
  model_id: z.string(),
  evidence_count: z.number().int().nonnegative(),
  source_breakdown: EvidenceSourceBreakdownSchema,
  retrieval_timestamp: z.string().datetime(),
  confidence: z.enum(["high", "medium", "low"]),
  missing_evidence: z.array(z.string()).default([]),
  partially_simulated: z.boolean().default(false),
  ai_transparency: z.object({
    evidence_backed: z.boolean(),
    audit_logged: z.boolean(),
    rbac_enforced: z.boolean(),
    read_only_fireblocks: z.boolean(),
    no_autonomous_execution: z.boolean(),
  }),
});
export type InvestigationProvenance = z.infer<typeof InvestigationProvenanceSchema>;

export const FireblocksSyncInfoSchema = z.object({
  timestamp: z.string().datetime(),
  environment: z.string(),
  connection_state: z.enum(["active", "degraded", "disconnected"]),
  last_successful_retrieval: z.string().datetime().optional(),
});
export type FireblocksSyncInfo = z.infer<typeof FireblocksSyncInfoSchema>;

export const InvestigationTransparencySchema = z.object({
  source_breakdown: EvidenceSourceBreakdownSchema,
  partially_simulated: z.boolean(),
  limited_activity_warning: z.string().optional(),
  operational_severity: OperationalSeveritySchema,
  severity_rationale: z.string(),
  provenance: InvestigationProvenanceSchema,
  graph_nodes: z.array(EvidenceGraphNodeSchema),
  graph_edges: z.array(EvidenceGraphEdgeSchema),
  traceable_ids: z.object({
    transaction_ids: z.array(z.string()),
    vault_ids: z.array(z.string()),
    evidence_ids: z.array(z.string()),
    approval_states: z.array(z.string()),
    policy_references: z.array(z.string()),
  }),
});
export type InvestigationTransparency = z.infer<typeof InvestigationTransparencySchema>;
