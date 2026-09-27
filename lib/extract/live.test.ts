import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { createModelClient } from "./client";
import { extractDocument } from "./extract";
import { readSample } from "./testing";

/**
 * The live smoke test (spec 0005, AC-14): one real call, run only when a key is set. It proves
 * the API accepts the generated strict schemas. Costs one API call.
 */
describe.skipIf(env.ANTHROPIC_API_KEY === undefined)("live extraction", () => {
  it("extracts NL-88121.pdf as an invoice with the real tools", async () => {
    const result = await extractDocument(
      { filename: "NL-88121.pdf", bytes: await readSample("NL-88121.pdf") },
      createModelClient(),
    );
    expect(result).toMatchObject({ ok: true, value: { kind: "invoice" } });
  }, 120_000);
});
