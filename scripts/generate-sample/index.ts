import { fileURLToPath } from "node:url";
import { renderSample } from "./render";
import { generateSampleFolder, summarize } from "./write";

/**
 * `pnpm generate:sample` (spec 0003): validates the fixture, renders every file, and swaps the
 * new set into public/sample/. Non zero exit on any failure, with the previous folder kept.
 */

const OUTPUT_DIR = fileURLToPath(
  new URL("../../public/sample", import.meta.url),
);
const TEMP_DIR = fileURLToPath(
  new URL("../../public/.sample.tmp", import.meta.url),
);

const main = async (): Promise<number> => {
  const result = await generateSampleFolder(renderSample, OUTPUT_DIR, TEMP_DIR);
  if (!result.ok) {
    process.stderr.write(
      `generate:sample failed, public/sample/ was not changed\n${result.error}\n`,
    );
    return 1;
  }
  process.stdout.write(`${summarize(result.value)}\nWrote public/sample/\n`);
  return 0;
};

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`generate:sample crashed: ${String(error)}\n`);
    process.exit(1);
  },
);
