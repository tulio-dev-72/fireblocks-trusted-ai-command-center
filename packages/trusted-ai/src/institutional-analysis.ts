import type { Citation, EvidenceItem, InstitutionalAnalysis, InvestigationMode } from "@taicc/shared-types";
import { investigationModeRecommendedAction } from "./investigation-mode.js";

export function buildInstitutionalAnalysis(input: {
  question: string;
  answer: string;
  citations: Citation[];
  evidence: EvidenceItem[];
  correlationId: string;
  auditEventId: string;
  delaySummary?: string;
  mode?: InvestigationMode;
}): InstitutionalAnalysis {
  const availableEvidence = input.evidence.filter((e) => e.available);
  const missingEvidence = input.evidence
    .filter((e) => !e.available)
    .map((e) => `${e.id}: ${e.label} unavailable`);

  const evidenceIds = input.citations.map((c) => c.evidence_id).join(", ") || "none";
  const confidence =
    availableEvidence.length >= 3 && input.citations.length >= 2
      ? "high"
      : availableEvidence.length >= 1
        ? "medium"
        : "low";

  const operationalImpact =
    input.delaySummary ??
    (availableEvidence.length > 0
      ? "Non-final or blocked operational records may affect settlement timelines and treasury liquidity posture."
      : "Operational impact cannot be quantified — retrieved evidence is insufficient.");

  const rootCause =
    confidence === "low"
      ? "Insufficient retrieved evidence to determine root cause with audit-grade certainty."
      : input.answer.slice(0, 400);

  return {
    summary: input.answer.split("\n")[0]?.slice(0, 280) ?? input.answer.slice(0, 280),
    operational_impact: operationalImpact,
    root_cause: rootCause,
    evidence: `Evidence IDs cited: ${evidenceIds}. ${input.citations.length} citation(s) from retrieved Fireblocks records.`,
    recommended_action: investigationModeRecommendedAction(input.mode ?? "operations"),
    audit_reference: `correlation_id=${input.correlationId}; audit_event_id=${input.auditEventId}`,
    confidence,
    missing_evidence: missingEvidence,
  };
}

export function formatInstitutionalAnswer(analysis: InstitutionalAnalysis): string {
  return [
    `Summary: ${analysis.summary}`,
    `Operational Impact: ${analysis.operational_impact}`,
    `Root Cause: ${analysis.root_cause}`,
    `Evidence: ${analysis.evidence}`,
    `Recommended Action: ${analysis.recommended_action}`,
    `Audit Reference: ${analysis.audit_reference}`,
    `Confidence: ${analysis.confidence.toUpperCase()}`,
    analysis.missing_evidence.length
      ? `Missing Evidence: ${analysis.missing_evidence.join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
