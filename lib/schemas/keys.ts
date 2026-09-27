import type { CheckId } from "./enums";

/** Trailing words that name a legal form, not the supplier. */
const LEGAL_SUFFIXES: ReadonlySet<string> = new Set([
  "inc",
  "incorporated",
  "co",
  "company",
  "corp",
  "corporation",
  "llc",
  "ltd",
  "limited",
]);

const dropLegalSuffixes = (words: readonly string[]): readonly string[] =>
  words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])
    ? dropLegalSuffixes(words.slice(0, -1))
    : words;

/** One key per supplier: "Northline Industrial Supply Inc." becomes "northline industrial supply". */
export const normalizeSupplierKey = (name: string): string => {
  const words = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > 0);
  return dropLegalSuffixes(words).join(" ");
};

/** Match key for duplicate detection: "NL-88310" and "NL88310" both become "NL88310". */
export const normalizeInvoiceNumber = (invoiceNumber: string): string =>
  invoiceNumber.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");

export type FindingKeyParts = {
  readonly check: CheckId;
  readonly supplierKey: string;
  /** As printed, not normalized. */
  readonly invoiceNumber: string;
  /** The SKU, the charge (`freight`, `surcharge-fuel`), or omitted. */
  readonly detail?: string;
};

/** Stable finding identity across reruns: `<check>:<supplierKey>:<invoiceNumber>:<detail>`. */
export const findingKey = ({
  check,
  supplierKey,
  invoiceNumber,
  detail,
}: FindingKeyParts): string =>
  [check, supplierKey, invoiceNumber, detail ?? "-"].join(":");
