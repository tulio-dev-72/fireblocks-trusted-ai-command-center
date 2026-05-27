import { describe, it, expect } from "vitest";
import { resolveDataMode } from "@taicc/config";

describe("Data mode resolution", () => {
  it("resolves demo mode", () => {
    expect(
      resolveDataMode({
        DEMO_MODE: true,
        HYBRID_MODE: false,
        REAL_FIREBLOCKS: false,
      } as never),
    ).toBe("demo");
  });

  it("resolves hybrid mode", () => {
    expect(
      resolveDataMode({
        DEMO_MODE: false,
        HYBRID_MODE: true,
        REAL_FIREBLOCKS: true,
      } as never),
    ).toBe("hybrid");
  });

  it("resolves real mode", () => {
    expect(
      resolveDataMode({
        DEMO_MODE: false,
        HYBRID_MODE: false,
        REAL_FIREBLOCKS: true,
      } as never),
    ).toBe("real");
  });
});
