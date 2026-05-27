import { describe, expect, it } from "vitest";
import { resetConfigCache, loadConfig } from "@taicc/config";
import { resolveLlmConfig } from "./llm-provider.js";

function configWith(overrides: Record<string, string>) {
  resetConfigCache();
  return loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: "test-secret-min-16-chars",
    ...overrides,
  });
}

describe("resolveLlmConfig", () => {
  it("prefers OpenAI when AI_PROVIDER=auto and both keys are set", () => {
    const config = configWith({
      AI_PROVIDER: "auto",
      OPENAI_API_KEY: "sk-openai",
      ANTHROPIC_API_KEY: "sk-ant",
    });

    expect(resolveLlmConfig(config)).toMatchObject({
      provider: "openai",
      modelId: "gpt-4o-mini",
      apiKey: "sk-openai",
    });
  });

  it("uses Anthropic when AI_PROVIDER=anthropic", () => {
    const config = configWith({
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-ant",
      ANTHROPIC_MODEL: "claude-sonnet-4-20250514",
    });

    expect(resolveLlmConfig(config)).toMatchObject({
      provider: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      apiKey: "sk-ant",
    });
  });

  it("falls back to Anthropic in auto mode when only Anthropic is configured", () => {
    const config = configWith({
      AI_PROVIDER: "auto",
      ANTHROPIC_API_KEY: "sk-ant",
    });

    expect(resolveLlmConfig(config)).toMatchObject({
      provider: "anthropic",
      apiKey: "sk-ant",
    });
  });

  it("uses grounded synthesis when no provider keys are configured", () => {
    const config = configWith({ AI_PROVIDER: "auto" });

    expect(resolveLlmConfig(config)).toMatchObject({
      provider: "grounded_synthesis",
      modelId: "evidence-grounded-v1",
    });
  });
});
