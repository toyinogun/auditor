import { beforeEach, describe, expect, it, vi } from "vitest";

/** The route wires lib/env.ts into the webhook handler (spec 0006, AC-3, AC-6). */

const mocks = vi.hoisted(() => ({
  env: {
    DATA_DIR: "./data-route-test-unused",
    ANTHROPIC_MODEL: "claude-sonnet-5",
    MAX_UPLOAD_MB: 10,
    DEMO_MODE: false,
    INGEST_SECRET: "s".repeat(64) as string | undefined,
  },
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));

const { POST, runtime } = await import("./route");

const post = (secret: string) =>
  POST(
    new Request("http://localhost/api/ingest", {
      method: "POST",
      headers: { "x-ingest-secret": secret },
    }),
  );

describe("POST /api/ingest", () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mocks.env.DEMO_MODE = false;
    mocks.env.INGEST_SECRET = "s".repeat(64);
  });

  it("runs on the Node runtime (AC-17)", () => {
    expect(runtime).toBe("nodejs");
  });

  it("answers 503 on the demo", async () => {
    mocks.env.DEMO_MODE = true;
    expect((await post("s".repeat(64))).status).toBe(503);
  });

  it("answers 503 when no secret is configured", async () => {
    mocks.env.INGEST_SECRET = undefined;
    expect((await post("s".repeat(64))).status).toBe(503);
  });

  it("answers 401 to a wrong secret", async () => {
    expect((await post("wrong")).status).toBe(401);
  });

  it("asks for a Content-Length once the secret matches", async () => {
    expect((await post("s".repeat(64))).status).toBe(411);
  });
});
