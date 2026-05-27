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
    description: "AI prompts and workflow questions are written to the audit log when enabled.",
    detail: config.AI_PROMPT_LOGGING
      ? config.AUDIT_STORE === "postgres"
        ? "Enabled — prompts persisted to Postgres audit_events with correlation IDs"
        : "Enabled — prompts stored in-memory (AUDIT_STORE=memory)"
      : "Disabled — enable AI_PROMPT_LOGGING for workflow traceability",
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
    description: "AI recommendations do not auto-execute. Outbound transfers require Fireblocks console approval.",
    detail:
      "Policy engine package exists but is not wired to the API request path (planned). Drafts are prepare-only.",
  };

  const llmDataUse: TrustControl = {
    id: "no_training_on_customer_data",
    label: "LLM Provider Data Use",
    status: "enforced",
    description: config.AI_NO_TRAINING_STATEMENT,
    detail: usesExternalLlm
      ? `${provider} API — review provider data-use terms for prompt retention and training`
      : "Local evidence formatting — no external model API call",
  };

  const auditTrail: TrustControl = {
    id: "audit_trail",
    label: "Audit Trail",
    status: "active",
    description: "Append-only audit events for prompts, evidence retrieval, AI responses, and workflows.",
    detail: config.AUDIT_STORE === "postgres"
      ? "Postgres append-only audit_events — immutable trigger blocks UPDATE/DELETE"
      : "In-memory store (AUDIT_STORE=memory — non-production test fallback)",
  };

  const controls = [
    promptLogging,
    dataProvenance,
    rbac,
    executionBoundary,
    humanApproval,
    llmDataUse,
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
    no_training_statement: llmDataUse,
    audit_trail: auditTrail,
    controls,
    data_mode: dataMode,
    correlation_id: correlationId,
  };
}
