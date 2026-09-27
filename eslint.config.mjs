import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// Files where Next.js or a tool requires a default export (AGENTS.md: named exports only).
const DEFAULT_EXPORT_ALLOWED = [
  "app/**/{page,layout,template,loading,error,global-error,not-found,default,route}.{ts,tsx}",
  "app/**/{opengraph-image,twitter-image,icon,apple-icon,sitemap,robots,manifest}.{ts,tsx}",
  "*.config.{ts,mts,mjs,js}",
];

const ANTHROPIC_SDK = {
  name: "@anthropic-ai/sdk",
  message: "Only lib/extract calls Claude (spec 0005).",
};

const NO_DB = {
  regex: "(^@/lib/db(/|$)|/db(/|$))",
  message:
    "lib/extract, lib/ingest/csv.ts and lib/ingest/detect.ts never touch the database.",
};

const NODE_FS = ["node:fs", "node:fs/promises", "fs", "fs/promises"].map(
  (name) => ({
    name,
    message:
      "Only lib/ingest/files.ts reads or writes the uploads folder (spec 0006).",
  }),
);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "import/no-default-export": "error",
    },
  },
  {
    files: DEFAULT_EXPORT_ALLOWED,
    rules: {
      "import/no-default-export": "off",
    },
  },
  // Only lib/extract talks to Claude (spec 0005, AC-13).
  {
    files: ["**/*.{ts,tsx,mts}"],
    ignores: ["lib/extract/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: [ANTHROPIC_SDK] }],
    },
  },
  // lib/checks stays pure (spec 0004, AC-15): shared schemas, zod and its own files only.
  {
    files: ["lib/checks/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!@/lib/schemas/|zod$|\\./|vitest$)",
              message:
                "lib/checks is pure: import only from @/lib/schemas/*, zod or lib/checks itself.",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "lib/checks is pure." },
        { object: "Math", property: "random", message: "lib/checks is pure." },
      ],
    },
  },
  // Extraction and CSV parsing never touch the database (spec 0005, AC-13).
  {
    files: ["lib/extract/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [NO_DB] }],
    },
  },
  // Only files.ts touches the uploads folder (spec 0006, AC-17); tests use temp folders.
  {
    files: ["lib/ingest/**/*.ts"],
    ignores: [
      "lib/ingest/files.ts",
      "lib/ingest/testing.ts",
      "lib/ingest/**/*.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [ANTHROPIC_SDK, ...NODE_FS] },
      ],
    },
  },
  // CSV parsing and file detection are pure (spec 0005 AC-13, spec 0006 AC-17).
  {
    files: ["lib/ingest/csv.ts", "lib/ingest/detect.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [ANTHROPIC_SDK, ...NODE_FS], patterns: [NO_DB] },
      ],
    },
  },
  {
    files: ["lib/ingest/csv.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [ANTHROPIC_SDK], patterns: [NO_DB] },
      ],
    },
  },
  // Last, so formatting rules never fight Prettier.
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "data/**",
    "drizzle/**",
    ".agents/**",
    ".claude/**",
    "public/sample/**",
    "public/.sample.tmp/**",
    "public/.sample.tmp.old/**",
  ]),
]);

export default eslintConfig;
