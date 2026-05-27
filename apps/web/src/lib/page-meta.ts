import type { Page } from "./navigation";

export const PAGE_SUBTITLES: Record<Page, string> = {
  home: "Evidence-backed operational intelligence built on top of Fireblocks infrastructure",
  investigator: "Evidence-backed root-cause analysis for delayed and non-final treasury transfers",
  evidence: "Retrieved Fireblocks records packaged for workflow citation and audit review",
  trust: "Runtime boundaries for data access, RBAC, audit logging, and LLM provider configuration",
  audit: "Workflow and AI events correlated by investigation ID",
  architecture: "Implemented trust boundaries, API flows, and planned capabilities",
  connection: "Fireblocks sandbox credential validation and endpoint reachability",
  "sandbox-readiness":
    "Live sandbox readiness metrics and human-only sandbox activity generation",
  "fb-auth": "RS256 JWT signing audit, path-sensitive request preview, and live sandbox auth test",
  usage: "Vercel Web Analytics, Speed Insights, and privacy-safe product event visibility",
};
