/** Institutional operational investigation prompts — homepage cards */
export const OPERATIONAL_INVESTIGATION_PROMPTS = [
  "Why are these treasury payments delayed?",
  "Which settlements require approval?",
  "Show liquidity risk across vaults.",
  "Investigate failed transfers from the last 24 hours.",
  "Explain current settlement bottlenecks.",
  "Which counterparties have elevated operational risk?",
  "Summarize treasury exposure and pending approvals.",
  "Which transfers are blocked by policy enforcement?",
  "Generate escalation summary for treasury leadership.",
  "Show operational impact of delayed settlements.",
] as const;

export type OperationalInvestigationPrompt =
  (typeof OPERATIONAL_INVESTIGATION_PROMPTS)[number];
