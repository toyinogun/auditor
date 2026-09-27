import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  DATA_DIR: "./data",
  ANTHROPIC_API_KEY: undefined as string | undefined,
  ANTHROPIC_MODEL: "claude-sonnet-5",
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const { createModelClient } = await import("./client");

describe("createModelClient", () => {
  beforeEach(() => {
    mockEnv.ANTHROPIC_API_KEY = undefined;
  });

  it("reports no key, so extraction fails before any call (AC-6)", () => {
    expect(createModelClient().apiKeySet).toBe(false);
  });

  it("refuses to send a request when there is no key", async () => {
    const deps = createModelClient();
    await expect(deps.createMessage({} as never)).rejects.toThrow(
      "createMessage called with no API key",
    );
  });

  it("reports a key when one is set", () => {
    mockEnv.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(createModelClient().apiKeySet).toBe(true);
  });
});
