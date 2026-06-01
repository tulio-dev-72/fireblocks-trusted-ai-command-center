export type Page =
  | "home"
  | "investigator"
  | "evidence"
  | "trust"
  | "audit"
  | "connection"
  | "fb-auth"
  | "sandbox-readiness"
  | "architecture"
  | "usage";

export const NAV_ITEMS: Array<{ id: Page; label: string; section: string }> = [
  { id: "home", label: "Treasury Operations", section: "Operations" },
  { id: "investigator", label: "Delayed Payments", section: "Workflows" },
  { id: "evidence", label: "Evidence Library", section: "Intelligence" },
  { id: "audit", label: "Audit Log", section: "Governance" },
  { id: "trust", label: "Trust Center", section: "Infrastructure" },
  { id: "architecture", label: "Architecture", section: "Infrastructure" },
  { id: "connection", label: "Fireblocks Link", section: "Infrastructure" },
  { id: "sandbox-readiness", label: "Operational Data Readiness", section: "Infrastructure" },
  { id: "fb-auth", label: "FB Auth Diagnostics", section: "Infrastructure" },
  { id: "usage", label: "Observability", section: "Infrastructure" },
];
