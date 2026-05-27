import type { EnvConfig } from "@taicc/config";
import {
  PolicyEngine,
  DEFAULT_POLICY_RULES,
  type PolicyEvaluationContext,
} from "@taicc/policy-engine";
import type { AuditLogger } from "@taicc/audit";
import type { Actor } from "@taicc/shared-types";
import { AuthError } from "@taicc/auth";

export class PolicyDeniedError extends AuthError {
  constructor(
    message: string,
    public readonly auditReference: string,
  ) {
    super("FORBIDDEN", message);
    this.name = "PolicyDeniedError";
  }
}

let policyEngine: PolicyEngine | null = null;

export function initPolicyEngine(config: EnvConfig): PolicyEngine {
  policyEngine = new PolicyEngine({
    defaultAction: config.POLICY_DEFAULT_ACTION,
    enforcementMode: config.POLICY_ENFORCEMENT_MODE,
  });
  policyEngine.setRules(DEFAULT_POLICY_RULES);
  return policyEngine;
}

export function getPolicyEngine(): PolicyEngine {
  if (!policyEngine) {
    throw new Error("Policy engine not initialized");
  }
  return policyEngine;
}

export function resolvePolicyAction(method: string, path: string): string {
  if (method === "GET" || method === "HEAD") return "read";

  if (
    path.includes("/investigate") ||
    path.includes("/ai/ask") ||
    path.includes("/agents/investigate") ||
    path.includes("/operations/") ||
    path.includes("/escalation") ||
    path.includes("/treasury/analyze")
  ) {
    return "investigate";
  }

  if (path.includes("/sandbox/activity/generate")) {
    return "transfer";
  }

  if (path.includes("/webhooks/fireblocks")) {
    return "create";
  }

  return "create";
}

export function resolveResourceType(path: string): string {
  if (path.includes("/transactions") || path.includes("/operations")) return "transaction";
  if (path.includes("/vault") || path.includes("/balances")) return "vault";
  if (path.includes("/agents")) return "agent";
  if (path.includes("/webhooks")) return "webhook";
  if (path.includes("/evidence")) return "evidence";
  if (path.includes("/audit")) return "audit";
  return "api";
}

export async function evaluateRequestPolicy(input: {
  actor: Actor;
  method: string;
  path: string;
  correlationId: string;
  auditLogger: AuditLogger;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const engine = getPolicyEngine();
  const context: PolicyEvaluationContext = {
    resourceType: resolveResourceType(input.path),
    action: resolvePolicyAction(input.method, input.path),
    actorId: input.actor.id,
    agentId: input.actor.type === "agent" ? input.actor.id : undefined,
    payload: input.payload ?? {},
  };

  const decision = engine.evaluate(context);

  const auditEvent = await input.auditLogger.record({
    correlationId: input.correlationId,
    eventType: "policy_evaluation",
    actorId: input.actor.id,
    action: `${input.method} ${input.path}`,
    outcome: decision.allowed ? "success" : "denied",
    metadata: {
      resourceType: context.resourceType,
      policyAction: context.action,
      decision: decision.action,
      reason: decision.reason,
      matchedRuleId: decision.matchedRuleId,
    },
  });

  if (!decision.allowed) {
    throw new PolicyDeniedError(
      `Policy denied: ${decision.reason}`,
      auditEvent.id,
    );
  }
}

/** Sandbox admin writes bypass policy engine write-deny (separate human-only path). */
export function isSandboxAdminWritePath(method: string, path: string): boolean {
  return method === "POST" && path === "/v1/sandbox/activity/generate";
}
