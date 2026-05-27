import type {
  PolicyDecision,
  PolicyRule,
  PolicyAction,
} from "@taicc/shared-types";

export interface PolicyEvaluationContext {
  resourceType: string;
  action: string;
  actorId: string;
  agentId?: string;
  payload: Record<string, unknown>;
}

export interface PolicyEngineConfig {
  defaultAction: PolicyAction;
  enforcementMode: "enforce" | "audit_only" | "disabled";
}

export class PolicyEngine {
  private rules: PolicyRule[] = [];

  constructor(private readonly config: PolicyEngineConfig) {}

  setRules(rules: PolicyRule[]): void {
    this.rules = [...rules]
      .filter((r) => r.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  evaluate(context: PolicyEvaluationContext): PolicyDecision {
    if (this.config.enforcementMode === "disabled") {
      return {
        allowed: true,
        action: "allow",
        reason: "Policy enforcement disabled",
        requiresApproval: false,
      };
    }

    for (const rule of this.rules) {
      if (!this.matchesRule(rule, context)) continue;

      const decision = this.ruleToDecision(rule);

      if (this.config.enforcementMode === "audit_only") {
        return {
          ...decision,
          allowed: true,
          reason: `[audit_only] Would have: ${decision.reason}`,
          requiresApproval: false,
        };
      }

      return decision;
    }

    const defaultAction = this.config.defaultAction;
    return {
      allowed: defaultAction === "allow",
      action: defaultAction,
      reason: `No matching policy rule; default action: ${defaultAction}`,
      requiresApproval: false,
    };
  }

  private matchesRule(
    rule: PolicyRule,
    context: PolicyEvaluationContext,
  ): boolean {
    const { conditions } = rule;

    if (
      conditions.resourceTypes?.length &&
      !conditions.resourceTypes.includes(context.resourceType)
    ) {
      return false;
    }

    if (
      conditions.actions?.length &&
      !conditions.actions.includes(context.action)
    ) {
      return false;
    }

    if (conditions.agentIds?.length && context.agentId) {
      if (!conditions.agentIds.includes(context.agentId)) return false;
    }

    if (conditions.maxAmountUsd !== undefined) {
      const amount = extractAmountUsd(context.payload);
      if (amount !== undefined && amount > conditions.maxAmountUsd) {
        return false;
      }
    }

    if (conditions.allowedDestinations?.length) {
      const destination = extractDestination(context.payload);
      if (
        destination &&
        !conditions.allowedDestinations.includes(destination)
      ) {
        return false;
      }
    }

    if (conditions.timeWindowUtc) {
      const now = new Date();
      const start = parseTimeToday(conditions.timeWindowUtc.start);
      const end = parseTimeToday(conditions.timeWindowUtc.end);
      const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      if (currentMinutes < start || currentMinutes > end) return false;
    }

    return true;
  }

  private ruleToDecision(rule: PolicyRule): PolicyDecision {
    switch (rule.action) {
      case "allow":
        return {
          allowed: true,
          action: "allow",
          matchedRuleId: rule.id,
          matchedRuleVersion: rule.version,
          reason: `Allowed by rule: ${rule.name}`,
          requiresApproval: false,
        };
      case "deny":
        return {
          allowed: false,
          action: "deny",
          matchedRuleId: rule.id,
          matchedRuleVersion: rule.version,
          reason: `Denied by rule: ${rule.name}`,
          requiresApproval: false,
        };
      case "require_approval":
        return {
          allowed: false,
          action: "require_approval",
          matchedRuleId: rule.id,
          matchedRuleVersion: rule.version,
          reason: `Requires approval per rule: ${rule.name}`,
          requiresApproval: true,
        };
    }
  }
}

function extractAmountUsd(payload: Record<string, unknown>): number | undefined {
  const amount = payload.amountUsd ?? payload.amount;
  return typeof amount === "number" ? amount : undefined;
}

function extractDestination(payload: Record<string, unknown>): string | undefined {
  const dest =
    payload.destination ??
    payload.destinationAddress ??
    payload.externalWalletId;
  return typeof dest === "string" ? dest : undefined;
}

function parseTimeToday(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export const DEFAULT_POLICY_RULES: PolicyRule[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Deny all write operations by default",
    version: 1,
    enabled: true,
    priority: 1000,
    conditions: {
      actions: ["create", "update", "delete", "transfer"],
    },
    action: "deny",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Allow read operations",
    version: 1,
    enabled: true,
    priority: 100,
    conditions: {
      actions: ["read", "list", "get"],
    },
    action: "allow",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Require approval for high-value transfers",
    version: 1,
    enabled: true,
    priority: 200,
    conditions: {
      resourceTypes: ["transaction"],
      actions: ["create", "transfer"],
    },
    action: "require_approval",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
