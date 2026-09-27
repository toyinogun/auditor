import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logEvent } from "./log";

describe("logEvent (AC-12)", () => {
  const written = () =>
    vi.mocked(process.stdout.write).mock.calls.map(([chunk]) => String(chunk));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T12:00:00.000Z"));
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes one JSON line with the fields as given plus a timestamp", () => {
    logEvent({
      event: "extraction",
      filename: "a.pdf",
      attempts: 1,
      kind: null,
    });
    expect(written()).toEqual([
      '{"event":"extraction","filename":"a.pdf","attempts":1,"kind":null,"at":"2026-09-27T12:00:00.000Z"}\n',
    ]);
  });

  it("keeps a value with a newline on one line", () => {
    logEvent({ event: "x", filename: "a\nb.pdf" });
    const [line] = written();
    expect(line.trimEnd().split("\n")).toHaveLength(1);
    expect(JSON.parse(line)).toMatchObject({ filename: "a\nb.pdf" });
  });
});
