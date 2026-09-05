import { describe, expect, it, vi } from "vitest";

// Simulate a deployment with no OpenAI key configured.
vi.mock("../config/env.js", () => ({
  env: { OPENAI_API_KEY: undefined, OPENAI_MODEL: "gpt-4o-mini" },
}));

const { OPENAI_MODEL, OpenAiUnavailableError, getOpenAiClient, isOpenAiConfigured } =
  await import("./openaiClient.js");

describe("openaiClient without an API key", () => {
  it("reports itself as unconfigured", () => {
    expect(isOpenAiConfigured()).toBe(false);
  });

  it("throws a typed error instead of constructing a client", () => {
    expect(() => getOpenAiClient()).toThrow(OpenAiUnavailableError);
    expect(() => getOpenAiClient()).toThrow(/OPENAI_API_KEY is not configured/);
  });

  it("still exposes the configured model", () => {
    expect(OPENAI_MODEL).toBe("gpt-4o-mini");
  });
});
