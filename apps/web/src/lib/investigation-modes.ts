import type { InvestigationMode } from "@taicc/shared-types";

/**
 * Display copy for investigation modes.
 *
 * `focus` mirrors the backend MODE_INSTRUCTIONS in
 * packages/trusted-ai/src/investigation-mode.ts — the exact lens text that is
 * sent to the LLM system prompt on each run. Keep the two in sync so the UI
 * accurately reflects what the model is actually instructed to prioritize.
 */
export interface InvestigationModeCopy {
  value: InvestigationMode;
  label: string;
  hint: string;
  focus: string;
}

export const INVESTIGATION_MODES: InvestigationModeCopy[] = [
  {
    value: "operations",
    label: "Operations",
    hint: "Day-to-day treasury ops focus",
    focus:
      "Prioritizes day-to-day operational root causes, queue backlogs, Fireblocks workflow state, and actionable next steps for ops teams.",
  },
  {
    value: "treasury",
    label: "Treasury",
    hint: "Liquidity and settlement lens",
    focus:
      "Prioritizes liquidity impact, settlement timing, vault funding, and approval bottlenecks affecting outbound treasury flows.",
  },
  {
    value: "risk",
    label: "Risk",
    hint: "Exposure and control emphasis",
    focus:
      "Prioritizes counterparty exposure, control failures, policy holds, and operational risk indicators tied to delayed settlements.",
  },
  {
    value: "compliance",
    label: "Compliance",
    hint: "Policy and audit trail focus",
    focus:
      "Prioritizes policy enforcement, AML/regulatory holds, audit trail completeness, and evidence gaps requiring compliance review.",
  },
  {
    value: "executive",
    label: "Executive",
    hint: "Concise impact summary",
    focus:
      "Provides a concise executive summary: business impact first, top root causes second, recommended escalation in plain language.",
  },
];

const MODE_BY_VALUE = new Map<InvestigationMode, InvestigationModeCopy>(
  INVESTIGATION_MODES.map((mode) => [mode.value, mode]),
);

export const MODE_LABELS: Record<InvestigationMode, string> = Object.fromEntries(
  INVESTIGATION_MODES.map((mode) => [mode.value, mode.label]),
) as Record<InvestigationMode, string>;

export function investigationModeFocus(mode: InvestigationMode): string {
  return MODE_BY_VALUE.get(mode)?.focus ?? "";
}

export function investigationModeLabel(mode: InvestigationMode): string {
  return MODE_BY_VALUE.get(mode)?.label ?? mode;
}

/**
 * Friendly label for the LLM provider returned by the API.
 * `grounded_synthesis` is the deterministic local fallback (no external model).
 */
export function modelProviderLabel(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "Anthropic (live model)";
    case "openai":
      return "OpenAI (live model)";
    case "grounded_synthesis":
      return "Local synthesis (no external model)";
    default:
      return provider;
  }
}
