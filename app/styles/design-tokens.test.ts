import { readFileSync } from "node:fs";
import path from "node:path";
import { formatHex8, parse } from "culori";
import postcss, { type AtRule, type Root } from "postcss";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

/**
 * The drift test (spec 0007, AC-4): every color, radius, layout spacing value and typography
 * role in `DESIGN.md` must reach Tailwind with the same value, through the mapping layer in
 * `app/globals.css` and at most one `var()` step into `app/styles/design-tokens.css`.
 */

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (file: string): string =>
  readFileSync(path.join(ROOT, file), "utf8");

type TypeRole = {
  readonly fontFamily: string;
  readonly fontSize: string;
  readonly fontWeight: number;
  readonly lineHeight: number;
  readonly letterSpacing?: string;
  readonly fontFeature?: string;
};

type DesignTokens = {
  readonly colors: Readonly<Record<string, string>>;
  readonly typography: Readonly<Record<string, TypeRole>>;
  readonly rounded: Readonly<Record<string, string>>;
  readonly spacing: Readonly<Record<string, string>>;
};

const FRONT_MATTER = /^---\n([\s\S]*?)\n---/;

const readDesign = (): DesignTokens => {
  const match = FRONT_MATTER.exec(read("DESIGN.md"));
  if (!match) throw new Error("DESIGN.md has no front matter");
  return parseYaml(match[1]) as DesignTokens;
};

/** Custom properties declared in a stylesheet, by name, filtered to one kind of parent. */
const declarations = (
  root: Root,
  keep: (parent: AtRule | undefined, selector: string | undefined) => boolean,
): ReadonlyMap<string, string> => {
  const found = new Map<string, string>();
  root.walkDecls(/^--/, (decl) => {
    const parent = decl.parent;
    const atRule = parent?.type === "atrule" ? (parent as AtRule) : undefined;
    const selector =
      parent?.type === "rule"
        ? (parent as { selector: string }).selector
        : undefined;
    if (keep(atRule, selector)) found.set(decl.prop, decl.value.trim());
  });
  return found;
};

/** The `@utility type-<role>` rules in the mapping layer, as property → value. */
const typeUtilities = (
  root: Root,
): ReadonlyMap<string, ReadonlyMap<string, string>> => {
  const found = new Map<string, ReadonlyMap<string, string>>();
  root.walkAtRules("utility", (rule) => {
    const name = rule.params.trim();
    if (!name.startsWith("type-")) return;
    const props = new Map<string, string>();
    rule.walkDecls((decl) => {
      props.set(decl.prop, decl.value.trim());
    });
    found.set(name.slice("type-".length), props);
  });
  return found;
};

const globalsCss = postcss.parse(read("app/globals.css"));
const tokensCss = postcss.parse(read("app/styles/design-tokens.css"));
const theme = declarations(globalsCss, (atRule) => atRule?.name === "theme");
const tokens = declarations(tokensCss, (_, selector) => selector === ":root");
const utilities = typeUtilities(globalsCss);
const design = readDesign();

const VAR_ONLY = /^var\(\s*(--[\w-]+)\s*\)$/;

/** Follows one `var()` into the token file; a literal value passes through. */
const resolve = (value: string): string | undefined => {
  const match = VAR_ONLY.exec(value);
  if (!match) return value;
  return tokens.get(match[1]);
};

const toHex = (value: string): string | undefined => {
  const color = parse(value);
  return color ? formatHex8(color) : undefined;
};

const ROOT_FONT_PX = 16;

/** Lengths in px (rem converted), other units kept, so `0.25rem` equals `4px`. */
const normalizeLength = (value: string): string => {
  const match = /^(-?[\d.]+)(px|rem|em|ch)?$/.exec(value.trim());
  if (!match) return value.trim();
  const amount = Number(match[1]);
  const unit = match[2] ?? "";
  if (amount === 0) return "0";
  if (unit === "rem") return `${amount * ROOT_FONT_PX}px`;
  return `${amount}${unit}`;
};

const normalizeFeatures = (value: string): string =>
  value
    .replace(/["']/g, "'")
    .replace(/\s*,\s*/g, ", ")
    .trim();

/** The DESIGN.md to Tailwind name table (spec 0007, Feature design). */
const SPACING_TOKEN: Readonly<Record<string, string>> = {
  "row-height": "--spacing-row-height",
  gutter: "--spacing-gutter",
  "page-margin": "--spacing-page",
  "app-max-width": "--container-app",
  measure: "--container-measure",
};

const TAILWIND_BUILT_IN_RADII = new Set(["none", "full"]);
const TAILWIND_DEFAULT_SPACING = "0.25rem";

const FAMILY_VAR: Readonly<Record<string, string>> = {
  "IBM Plex Sans": "var(--font-sans)",
  "IBM Plex Mono": "var(--font-mono)",
  "Instrument Serif": "var(--font-serif)",
};

describe("design tokens match DESIGN.md", () => {
  it.each(Object.entries(design.colors))("color %s", (name, expected) => {
    const mapped = theme.get(`--color-${name}`);
    expect(mapped, `--color-${name} is not in @theme`).toBeDefined();
    const actual = resolve(mapped ?? "");
    expect(
      toHex(actual ?? ""),
      `color ${name}: DESIGN.md has ${expected}, the tokens give ${actual}`,
    ).toBe(toHex(expected));
  });

  it.each(
    Object.entries(design.rounded).filter(
      ([name]) => !TAILWIND_BUILT_IN_RADII.has(name),
    ),
  )("radius %s", (name, expected) => {
    const mapped = theme.get(`--radius-${name}`);
    expect(mapped, `--radius-${name} is not in @theme`).toBeDefined();
    const actual = resolve(mapped ?? "") ?? "";
    expect(
      normalizeLength(actual),
      `radius ${name}: DESIGN.md has ${expected}, the tokens give ${actual}`,
    ).toBe(normalizeLength(expected));
  });

  it.each(Object.entries(SPACING_TOKEN))("layout spacing %s", (name, token) => {
    const expected = design.spacing[name];
    const mapped = theme.get(token);
    expect(mapped, `${token} is not in @theme`).toBeDefined();
    const actual = resolve(mapped ?? "") ?? "";
    expect(
      normalizeLength(actual),
      `spacing ${name}: DESIGN.md has ${expected}, the tokens give ${actual}`,
    ).toBe(normalizeLength(expected));
  });

  it("keeps Tailwind's 4px spacing step equal to spacing.base", () => {
    const step = resolve(theme.get("--spacing") ?? TAILWIND_DEFAULT_SPACING);
    expect(normalizeLength(step ?? "")).toBe(
      normalizeLength(design.spacing.base),
    );
  });

  it.each(Object.entries(design.typography))("type role %s", (role, spec) => {
    const rule = utilities.get(role);
    expect(rule, `@utility type-${role} is missing`).toBeDefined();
    const prop = (name: string): string => rule?.get(name) ?? "";
    const value = (name: string): string => resolve(prop(name)) ?? "";

    expect(prop("font-family"), `type-${role} font-family`).toBe(
      FAMILY_VAR[spec.fontFamily],
    );
    expect(
      normalizeLength(value("font-size")),
      `type-${role} font-size: DESIGN.md has ${spec.fontSize}, the tokens give ${value("font-size")}`,
    ).toBe(normalizeLength(spec.fontSize));
    expect(
      Number(value("line-height")),
      `type-${role} line-height: DESIGN.md has ${spec.lineHeight}, the tokens give ${value("line-height")}`,
    ).toBe(Number(spec.lineHeight));
    expect(
      normalizeLength(value("letter-spacing")),
      `type-${role} letter-spacing: DESIGN.md has ${spec.letterSpacing ?? "none"}, the tokens give ${value("letter-spacing")}`,
    ).toBe(normalizeLength(spec.letterSpacing ?? "0"));
    expect(
      Number(value("font-weight")),
      `type-${role} font-weight: DESIGN.md has ${spec.fontWeight}, the tokens give ${value("font-weight")}`,
    ).toBe(spec.fontWeight);

    const features = rule?.get("font-feature-settings");
    if (spec.fontFeature === undefined) {
      expect(
        features,
        `type-${role} sets font features DESIGN.md lacks`,
      ).toBeUndefined();
    } else {
      expect(
        normalizeFeatures(features ?? ""),
        `type-${role} font-feature-settings: DESIGN.md has ${spec.fontFeature}, globals.css has ${features}`,
      ).toBe(normalizeFeatures(spec.fontFeature));
    }
  });
});
