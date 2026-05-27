import { describe, it, expect, beforeEach } from "vitest";
import { PolicyEngine, DEFAULT_POLICY_RULES } from "./index.js";

describe("PolicyEngine", () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine({
      defaultAction: "deny",
      enforcementMode: "enforce",
    });
    engine.setRules(DEFAULT_POLICY_RULES);
  });

  it("allows read operations", () => {
    const decision = engine.evaluate({
      resourceType: "vault_account",
      action: "read",
      actorId: "actor-1",
      payload: {},
    });
    expect(decision.allowed).toBe(true);
    expect(decision.action).toBe("allow");
  });

  it("denies write operations by default", () => {
    const decision = engine.evaluate({
      resourceType: "transaction",
      action: "create",
      actorId: "actor-1",
      payload: { amountUsd: 100 },
    });
    expect(decision.requiresApproval).toBe(true);
  });

  it("denies unmatched operations with deny default", () => {
    const decision = engine.evaluate({
      resourceType: "unknown",
      action: "unknown_action",
      actorId: "actor-1",
      payload: {},
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("default action: deny");
  });
});
