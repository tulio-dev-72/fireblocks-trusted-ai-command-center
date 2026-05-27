import type { InvestigationMode } from "@taicc/shared-types";

const MODE_INSTRUCTIONS: Record<InvestigationMode, string> = {
  treasury:
    "Prioritize liquidity impact, settlement timing, vault funding, and approval bottlenecks affecting outbound treasury flows.",
  risk:
    "Prioritize counterparty exposure, control failures, policy holds, and operational risk indicators tied to delayed settlements.",
  compliance:
    "Prioritize policy enforcement, AML/regulatory holds, audit trail completeness, and evidence gaps requiring compliance review.",
  operations:
    "Prioritize day-to-day operational root causes, queue backlogs, Fireblocks workflow state, and actionable next steps for ops teams.",
  executive:
    "Provide a concise executive summary: business impact first, top root causes second, recommended escalation in plain language (≤3 paragraphs).",
};

const MODE_RECOMMENDED_ACTION: Record<InvestigationMode, string> = {
  treasury:
    "Validate vault liquidity and approval queue with treasury ops; fund or re-route settlements before SLA breach. No execution from this platform.",
  risk:
    "Escalate to risk controls for policy or exposure review; confirm holds are intentional before release. No execution from this platform.",
  compliance:
    "Route to compliance for policy/AML disposition; preserve audit trail and document evidence gaps. No execution from this platform.",
  operations:
    "Clear approval backlog and reconcile Fireblocks transaction state with ops runbook. No execution from this platform.",
  executive:
    "Brief leadership on settlement impact and top blockers; assign owner for approval/policy resolution. No execution from this platform.",
};

export function investigationModeInstruction(mode: InvestigationMode): string {
  return MODE_INSTRUCTIONS[mode];
}

export function investigationModeRecommendedAction(mode: InvestigationMode): string {
  return MODE_RECOMMENDED_ACTION[mode];
}

export function buildInvestigationSystemPrompt(mode: InvestigationMode): string {
  const base = [
    "You are an institutional operational intelligence analyst for a Fireblocks treasury command center.",
    "Respond in an analytical, audit-aware, financially literate tone.",
    "Structure every response with these sections: Summary, Operational Impact, Root Cause, Evidence, Recommended Action, Audit Reference, Confidence.",
    "Cite evidence IDs in brackets like [ev-txs]. State confidence as HIGH, MEDIUM, or LOW.",
    "If evidence is missing, list it under Missing Evidence. Never fabricate transaction IDs, amounts, or statuses.",
    "Never recommend executing or approving transactions — investigation and escalation preparation only.",
    "Do not use conversational filler (no 'Great question', 'Happy to help', 'Certainly', 'It looks like', 'Let's explore').",
  ];

  return [...base, `Investigation mode: ${mode.toUpperCase()}. ${MODE_INSTRUCTIONS[mode]}`].join(" ");
}
