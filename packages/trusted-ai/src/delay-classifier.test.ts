import { describe, it, expect } from "vitest";
import {
  classifyDelayReason,
  isDelayedTransaction,
  groupDelayedTransactions,
} from "./delay-classifier.js";

describe("delay-classifier", () => {
  it("identifies delayed transactions", () => {
    expect(isDelayedTransaction({ id: "1", status: "PENDING_AUTHORIZATION" })).toBe(true);
    expect(isDelayedTransaction({ id: "2", status: "COMPLETED" })).toBe(false);
  });

  it("classifies approval pending", () => {
    const reason = classifyDelayReason(
      { id: "1", status: "PENDING_SIGNATURE" },
      [],
    );
    expect(reason).toBe("approval_pending");
  });

  it("classifies failed transfer", () => {
    const reason = classifyDelayReason({ id: "1", status: "FAILED" }, []);
    expect(reason).toBe("failed_transfer");
  });

  it("groups delayed transactions by reason", () => {
    const groups = groupDelayedTransactions(
      [
        { id: "a", status: "FAILED" },
        { id: "b", status: "PENDING_AUTHORIZATION" },
        { id: "c", status: "CONFIRMING" },
      ],
      [],
    );
    expect(groups.get("failed_transfer")?.length).toBe(1);
    expect(groups.get("approval_pending")?.length).toBe(1);
    expect(groups.get("network_delay")?.length).toBe(1);
  });
});
