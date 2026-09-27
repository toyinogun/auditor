import { describe, expect, it } from "vitest";
import { readEnv } from "./env";

describe("readEnv", () => {
  it("fills the defaults when nothing is set", () => {
    expect(readEnv({})).toEqual({
      DATA_DIR: "./data",
      ANTHROPIC_MODEL: "claude-sonnet-5",
      DEMO_MODE: false,
      MAX_UPLOAD_MB: 10,
    });
  });

  it("treats an empty string as unset", () => {
    expect(
      readEnv({ INGEST_SECRET: "", DEMO_MODE: "", MAX_UPLOAD_MB: "" }),
    ).toMatchObject({ DEMO_MODE: false, MAX_UPLOAD_MB: 10 });
    expect(readEnv({ INGEST_SECRET: "" }).INGEST_SECRET).toBeUndefined();
  });

  it("reads the ingest settings (spec 0006, AC-15)", () => {
    const secret = "a".repeat(64);
    expect(
      readEnv({
        INGEST_SECRET: secret,
        DEMO_MODE: "true",
        MAX_UPLOAD_MB: "25",
      }),
    ).toMatchObject({
      INGEST_SECRET: secret,
      DEMO_MODE: true,
      MAX_UPLOAD_MB: 25,
    });
  });

  it.each([
    ["a secret shorter than 32 characters", { INGEST_SECRET: "short" }],
    ["DEMO_MODE other than true or false", { DEMO_MODE: "yes" }],
    ["MAX_UPLOAD_MB of 0", { MAX_UPLOAD_MB: "0" }],
    ["MAX_UPLOAD_MB over 50", { MAX_UPLOAD_MB: "51" }],
    ["a fractional MAX_UPLOAD_MB", { MAX_UPLOAD_MB: "2.5" }],
    ["a MAX_UPLOAD_MB that is not a number", { MAX_UPLOAD_MB: "ten" }],
  ])("refuses %s", (_label, source) => {
    expect(() => readEnv(source)).toThrow();
  });
});
