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

const FS_IMPORT =
  'import { readFile } from "node:fs/promises";\nexport const a = readFile;\n';

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

  it.each([
    "lib/extract/probe.ts",
    "lib/ingest/csv.ts",
    "lib/ingest/detect.ts",
  ])("refuses lib/db in %s", async (filePath) => {
    expect(await ruleIds(DB_IMPORT, filePath)).toContain(
      "no-restricted-imports",
    );
  });

  it.each([
    "lib/ingest/ingest.ts",
    "lib/ingest/detect.ts",
    "lib/ingest/csv.ts",
  ])("refuses node:fs in %s (spec 0006, AC-17)", async (filePath) => {
    expect(await ruleIds(FS_IMPORT, filePath)).toContain(
      "no-restricted-imports",
    );
  });

  it("allows node:fs in lib/ingest/files.ts", async () => {
    expect(await ruleIds(FS_IMPORT, "lib/ingest/files.ts")).not.toContain(
      "no-restricted-imports",
    );
  });
}, 30_000);
