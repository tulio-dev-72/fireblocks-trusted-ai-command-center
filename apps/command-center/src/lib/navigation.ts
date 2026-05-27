export type Page =
  | "home"
  | "investigator"
  | "evidence"
  | "trust"
  | "audit"
  | "connection";

export const NAV_ITEMS: Array<{ id: Page; label: string; section: string }> = [
  { id: "home", label: "Command Overview", section: "Operations" },
  { id: "investigator", label: "Delayed Payments", section: "Workflows" },
  { id: "evidence", label: "Evidence Library", section: "Trust" },
  { id: "trust", label: "Trust Center", section: "Trust" },
  { id: "audit", label: "Audit Log", section: "Governance" },
  { id: "connection", label: "Fireblocks Link", section: "Infrastructure" },
];
