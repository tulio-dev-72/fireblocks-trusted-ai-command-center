import type { EnvConfig } from "@taicc/config";
import type { DataService } from "@taicc/data-layer";
import type { TrustCenterStatus, TrustControl } from "@taicc/shared-types";
import { resolveLlmConfig } from "./llm-provider.js";

export function buildTrustCenterStatus(
  config: EnvConfig,
  dataService: DataService,
  correlationId: string,
): TrustCenterStatus {
  const llmConfig = resolveLlmConfig(config);
  const provider = llmConfig.provider;
  const modelId = llmConfig.modelId;
  const usesExternalLlm = provider === "openai" || provider === "anthropic";
  const dataMode = dataService.getMode();

  const promptLogging: TrustControl = {
    id: "prompt_logging",
    label: "Prompt Logging",
    status: config.AI_PROMPT_LOGGING ? "active" : "disabled",
    description: "All AI prompts and workflow questions are written to the immutable audit trail.",
    detail: config.AI_PROMPT_LOGGING
      ? "Enabled — prompts stored with correlation IDs"
      : "Disabled — not recommended for production",
  };

  const dataProvenance: TrustControl = {
    id: "data_provenance",
    label: "Data Provenance",
    status: dataMode === "real" ? "enforced" : "warning",
    description: "Every data point carries source_type metadata (REAL_FIREBLOCKS, DERIVED_AI, etc.).",
    detail:
      dataMode === "real"
        ? "Real Fireblocks sandbox — no silent fallback to demo data"
        : `Current mode: ${dataMode} — AI workflows blocked in demo mode`,
  };

  const rbac: TrustControl = {
    id: "rbac_enforcement",
    label: "RBAC Enforcement",
    status: "enforced",
    description: "Role-based access control gates every workflow step and evidence retrieval.",
    detail: "JWT + permission checks with rbac_filter audit events",
  };

  const executionBoundary: TrustControl = {
    id: "fireblocks_execution_boundary",
    label: "Fireblocks Execution Boundary",
    status: "enforced",
    description: "Read-only Fireblocks integration — no signing, submission, or approval execution.",
    detail: "Transaction drafts and escalation summaries are prepare-only; human approval required",
  };

  const humanApproval: TrustControl = {
    id: "human_approval_requirement",
    label: "Human Approval Requirement",
    status: "enforced",
    description: "AI recommendations never auto-execute. All outbound actions require human sign-off.",
    detail: "Policy engine default action: deny; approvals remain in Fireblocks console",
  };

  const noTraining: TrustControl = {
    id: "no_training_on_customer_data",
    label: "No Training on Customer Data",
    status: "enforced",
    description: config.AI_NO_TRAINING_STATEMENT,
    detail: usesExternalLlm
      ? `Enterprise ${provider} API — data not used for model training per provider enterprise terms`
      : "Grounded synthesis runs locally — no external model training path",
  };

  const auditTrail: TrustControl = {
    id: "audit_trail",
    label: "Audit Trail",
    status: "active",
    description: "Append-only audit log captures prompts, evidence retrieval, AI responses, and workflows.",
    detail: "Events: ai_prompt, ai_response, evidence_retrieved, workflow_executed, escalation_prepared",
  };

  const controls = [
    promptLogging,
    dataProvenance,
    rbac,
    executionBoundary,
    humanApproval,
    noTraining,
    auditTrail,
  ];

  return {
    model_provider: provider,
    model_id: modelId,
    prompt_logging: promptLogging,
    data_provenance: dataProvenance,
    rbac_enforcement: rbac,
    fireblocks_execution_boundary: executionBoundary,
    human_approval_requirement: humanApproval,
    no_training_statement: noTraining,
    audit_trail: auditTrail,
    controls,
    data_mode: dataMode,
    correlation_id: correlationId,
  };
}
