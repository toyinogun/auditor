import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/** The import boundaries hold at lint time (spec 0005, AC-13). */

const eslint = new ESLint();

const ruleIds = async (code: string, filePath: string) => {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((message) => message.ruleId);
};

const SDK_IMPORT =
  'import Anthropic from "@anthropic-ai/sdk";\nexport const a = Anthropic;\n';
const DB_IMPORT =
  'import { resetAll } from "@/lib/db/admin";\nexport const a = resetAll;\n';

describe("import boundaries", () => {
  it.each(["lib/audit/probe.ts", "app/probe.ts", "lib/ingest/csv.ts"])(
    "refuses the Anthropic SDK in %s",
    async (filePath) => {
      expect(await ruleIds(SDK_IMPORT, filePath)).toContain(
        "no-restricted-imports",
      );
    },
  );

  it("allows the Anthropic SDK in lib/extract", async () => {
    expect(await ruleIds(SDK_IMPORT, "lib/extract/probe.ts")).not.toContain(
      "no-restricted-imports",
    );
  });

  it.each(["lib/extract/probe.ts", "lib/ingest/csv.ts"])(
    "refuses lib/db in %s",
    async (filePath) => {
      expect(await ruleIds(DB_IMPORT, filePath)).toContain(
        "no-restricted-imports",
      );
    },
  );
}, 30_000);
