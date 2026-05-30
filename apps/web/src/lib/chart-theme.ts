/** Restrained palette for dark operational dashboards — no neon, no gradients. */
export const CHART = {
  grid: "#2e2920",
  axis: "#8b8273",
  label: "#bcb3a1",
  tooltipBg: "#1b1812",
  tooltipBorder: "#2e2920",
  cleared: "#8b8273",
  approval: "#9a8f7a",
  policy: "#b07a2e",
  network: "#6b6256",
  failed: "#b04a36",
  inFlight: "#6f6456",
  liquidity: "#7a6e58",
  pendingShort: "#8b8273",
  pendingMedium: "#9a8f7a",
  pendingLong: "#b07a2e",
  pendingCritical: "#b04a36",
} as const;

export const CHART_FONT = "11px ui-monospace, SFMono-Regular, Menlo, monospace";

export const CHART_MARGIN = { top: 8, right: 12, left: 0, bottom: 4 } as const;
