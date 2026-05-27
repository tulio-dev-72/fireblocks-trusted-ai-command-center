import { z } from "zod";

export const AgentCapabilitySchema = z.enum([
  "investigate",
  "summarize",
  "escalate",
  "evidence_retrieval",
]);
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

export const AgentRegistrationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.enum(["human", "agent", "service"]),
  capabilities: z.array(AgentCapabilitySchema),
  status: z.enum(["active", "disabled"]),
  execution_boundary: z.literal("read_only"),
  description: z.string(),
});
export type AgentRegistration = z.infer<typeof AgentRegistrationSchema>;

export const AgentsListResponseSchema = z.object({
  agents: z.array(AgentRegistrationSchema),
  note: z.string(),
});
export type AgentsListResponse = z.infer<typeof AgentsListResponseSchema>;

export const AgentInvestigateRequestSchema = z.object({
  question: z.string().min(1),
  workflow: z.string().optional(),
});
export type AgentInvestigateRequest = z.infer<typeof AgentInvestigateRequestSchema>;

/** Platform-registered investigation agents (read-only boundary enforced at API) */
export const PLATFORM_AGENTS: AgentRegistration[] = [
  {
    id: "00000000-0000-4000-8000-000000000010",
    name: "Delayed Payments Investigator",
    type: "agent",
    capabilities: ["investigate", "summarize", "evidence_retrieval"],
    status: "active",
    execution_boundary: "read_only",
    description:
      "Evidence-backed root-cause analysis for non-final treasury transfers. No transaction execution.",
  },
  {
    id: "00000000-0000-4000-8000-000000000011",
    name: "Operational Intelligence Analyst",
    type: "agent",
    capabilities: ["investigate", "summarize", "escalate"],
    status: "active",
    execution_boundary: "read_only",
    description:
      "Institutional operational Q&A over retrieved Fireblocks evidence. Prepare-only recommendations.",
  },
];
