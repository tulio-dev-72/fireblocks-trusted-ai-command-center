/** Restrained palette for dark operational dashboards — no neon, no gradients. */
export const CHART = {
  grid: "#1f2937",
  axis: "#6b7280",
  label: "#9ca3af",
  tooltipBg: "#111827",
  tooltipBorder: "#374151",
  cleared: "#64748b",
  approval: "#78716c",
  policy: "#92400e",
  network: "#475569",
  failed: "#991b1b",
  inFlight: "#4b5563",
  liquidity: "#546e7a",
  pendingShort: "#64748b",
  pendingMedium: "#78716c",
  pendingLong: "#92400e",
  pendingCritical: "#991b1b",
} as const;

export const CHART_FONT = "11px ui-monospace, SFMono-Regular, Menlo, monospace";

export const CHART_MARGIN = { top: 8, right: 12, left: 0, bottom: 4 } as const;
