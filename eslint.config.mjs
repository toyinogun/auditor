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
