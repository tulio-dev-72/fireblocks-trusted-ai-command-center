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

/**
 * Short definition of what each investigation does. Every prompt runs the
 * delayed-payments investigator against live Fireblocks evidence; these
 * describe the lens/output so an operator knows what to expect before running.
 */
export const PROMPT_HINTS: Record<OperationalInvestigationPrompt, string> = {
  "Why are these treasury payments delayed?":
    "Groups all non-final transfers by root cause (approval, policy, balance, failed, network) and explains the primary blockers.",
  "Which settlements require approval?":
    "Lists transfers sitting in the Fireblocks approval queue awaiting signer or approver action.",
  "Show liquidity risk across vaults.":
    "Analyzes vault balances to flag concentration and assets at risk of underfunding settlements.",
  "Investigate failed transfers from the last 24 hours.":
    "Surfaces recently failed transactions and likely causes to prepare re-submission — no auto-execution.",
  "Explain current settlement bottlenecks.":
    "Identifies where transfers are stalling in the lifecycle and which stage is the current constraint.",
  "Which counterparties have elevated operational risk?":
    "Highlights destinations and counterparties associated with holds, failures, or policy friction.",
  "Summarize treasury exposure and pending approvals.":
    "Executive-style rollup of outstanding exposure and items awaiting authorization.",
  "Which transfers are blocked by policy enforcement?":
    "Finds transactions held by TAP policy or AML/compliance screening and explains why.",
  "Generate escalation summary for treasury leadership.":
    "Drafts a leadership-ready escalation brief from the investigation evidence — draft only, no execution.",
  "Show operational impact of delayed settlements.":
    "Quantifies the downstream operational impact of delayed and non-final settlements.",
};
