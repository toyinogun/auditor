import "server-only";
import type { Finding } from "@/lib/schemas/finding";
import { formatCents } from "@/lib/schemas/money";
import type { AuditInput } from "@/lib/schemas/records";

/**
 * Live against offline (spec 0005, AC-9). Pure: each difference becomes one mismatch that names
 * its file and field path, printed as `<filename>: <path>: live <value>, offline <value>`.
 */

export type Mismatch = {
  readonly filename: string;
  readonly path: string;
  readonly live: string;
  readonly offline: string;
};

export const formatMismatch = (mismatch: Mismatch): string =>
  `${mismatch.filename}: ${mismatch.path}: live ${mismatch.live}, offline ${mismatch.offline}`;

/** Free text is compared after trimming and collapsing whitespace; every other field exactly. */
const FREE_TEXT_FIELDS: ReadonlySet<string> = new Set([
  "description",
  "label",
  "clause",
  "freightClause",
  "surchargeClause",
  "supplierName",
]);

const MISSING = "missing";

const collapse = (text: string): string => text.trim().replace(/\s+/g, " ");

const show = (value: unknown): string =>
  value === undefined ? MISSING : JSON.stringify(value);

type Difference = Omit<Mismatch, "filename">;

const isPlainObject = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const joinPath = (path: string, key: string): string =>
  path === "" ? key : `${path}.${key}`;

const sameLeaf = (live: unknown, offline: unknown, key: string): boolean =>
  FREE_TEXT_FIELDS.has(key) &&
  typeof live === "string" &&
  typeof offline === "string"
    ? collapse(live) === collapse(offline)
    : Object.is(live, offline);

const diff = (
  live: unknown,
  offline: unknown,
  path: string,
  key: string,
): readonly Difference[] => {
  if (Array.isArray(live) && Array.isArray(offline)) {
    return Array.from(
      { length: Math.max(live.length, offline.length) },
      (_, index) => diff(live[index], offline[index], `${path}[${index}]`, key),
    ).flat();
  }
  if (isPlainObject(live) && isPlainObject(offline)) {
    const keys = [...new Set([...Object.keys(offline), ...Object.keys(live)])];
    return keys.flatMap((child) =>
      diff(live[child], offline[child], joinPath(path, child), child),
    );
  }
  return sameLeaf(live, offline, key)
    ? []
    : [
        {
          path: path === "" ? "record" : path,
          live: show(live),
          offline: show(offline),
        },
      ];
};

type Located = { readonly filename: string };

/** Groups a collection by file: a document record, or the rows of a CSV. */
const byFile = <T extends Located>(
  records: readonly T[],
): ReadonlyMap<string, readonly T[]> =>
  records.reduce(
    (groups, record) =>
      new Map([
        ...groups,
        [record.filename, [...(groups.get(record.filename) ?? []), record]],
      ]),
    new Map<string, readonly T[]>(),
  );

const compareCollection = <T extends Located>(
  live: readonly T[],
  offline: readonly T[],
  asRows: boolean,
): readonly Mismatch[] => {
  const liveFiles = byFile(live);
  const offlineFiles = byFile(offline);
  const filenames = [...new Set([...offlineFiles.keys(), ...liveFiles.keys()])];
  return filenames.flatMap((filename) => {
    const liveRecords = liveFiles.get(filename);
    const offlineRecords = offlineFiles.get(filename);
    const differences = asRows
      ? diff(liveRecords ?? [], offlineRecords ?? [], "rows", "rows")
      : diff(liveRecords?.[0], offlineRecords?.[0], "", "");
    return differences.map((difference) => ({ filename, ...difference }));
  });
};

/** Every field where the live records differ from the offline ones, by file. */
export const compareRecords = (
  live: AuditInput,
  offline: AuditInput,
): readonly Mismatch[] => [
  ...compareCollection(live.contracts, offline.contracts, false),
  ...compareCollection(live.purchaseOrders, offline.purchaseOrders, false),
  ...compareCollection(live.invoices, offline.invoices, false),
  ...compareCollection(live.receipts, offline.receipts, true),
  ...compareCollection(live.payments, offline.payments, true),
];

type ComparableFinding = Pick<
  Finding,
  "findingKey" | "action" | "amountCents" | "invoiceDocumentId"
>;

const showFinding = (finding: ComparableFinding | undefined): string =>
  finding === undefined
    ? MISSING
    : `${finding.action} ${formatCents(finding.amountCents)}`;

/**
 * Findings matched by `findingKey`, compared by action and amount. Evidence is not compared: the
 * checks are pure, so equal records give equal evidence. `filenameOf` names the finding's invoice.
 */
export const compareFindings = (
  live: readonly ComparableFinding[],
  offline: readonly ComparableFinding[],
  filenameOf: (documentId: number) => string,
): readonly Mismatch[] => {
  const liveByKey = new Map(
    live.map((finding) => [finding.findingKey, finding]),
  );
  const offlineByKey = new Map(
    offline.map((finding) => [finding.findingKey, finding]),
  );
  const keys = [...new Set([...offlineByKey.keys(), ...liveByKey.keys()])];
  return keys.flatMap((key) => {
    const liveFinding = liveByKey.get(key);
    const offlineFinding = offlineByKey.get(key);
    const same =
      liveFinding !== undefined &&
      offlineFinding !== undefined &&
      liveFinding.action === offlineFinding.action &&
      liveFinding.amountCents === offlineFinding.amountCents;
    if (same) return [];
    const either = liveFinding ?? offlineFinding;
    return either === undefined
      ? []
      : [
          {
            filename: filenameOf(either.invoiceDocumentId),
            path: `finding ${key}`,
            live: showFinding(liveFinding),
            offline: showFinding(offlineFinding),
          },
        ];
  });
};

/** Each classified kind against the manifest's kind for that file. */
export const compareKinds = (
  expected: readonly { readonly filename: string; readonly kind: string }[],
  classified: ReadonlyMap<string, string>,
): readonly Mismatch[] =>
  expected.flatMap(({ filename, kind }) => {
    const live = classified.get(filename);
    return live === kind
      ? []
      : [{ filename, path: "kind", live: live ?? MISSING, offline: kind }];
  });
