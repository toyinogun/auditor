import { z } from "zod";
import { citationsFor } from "@/lib/checks/invoice-view";
import type { DecisionState, Finding } from "@/lib/schemas/finding";
import { centsToPlain, utcMinute } from "./format";
import { ACTION_LABEL, CHECK_LABEL, DECISION_LABEL } from "./labels";

/**
 * One row model both writers format (spec 0009, AC-4, AC-8, AC-9), so the .xlsx and the .csv can
 * never disagree on content. Pure: the snapshot and the request time come in as values.
 */

export const ExportFormat = z.enum(["xlsx", "csv"]);
export type ExportFormat = z.infer<typeof ExportFormat>;

export type Cell =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "money"; readonly cents: number }
  | { readonly kind: "count"; readonly value: number }
  | { readonly kind: "empty" };

/** What the export needs of one finding; `FindingView` from `listFindings` is one. */
export type ExportFinding = Finding & {
  readonly supplierName: string;
  readonly invoiceNumber: string;
  readonly decision: DecisionState;
};

/** The latest run, its headline, its findings and the review tiles, read as one snapshot. */
export type ExportSnapshot = {
  readonly run: {
    readonly finishedAt: number;
    readonly invoiceCount: number;
    readonly invoicedTotalCents: number;
    readonly findingCount: number;
  };
  readonly headline: {
    readonly recoverableCents: number;
    readonly recoverableShare: string;
  };
  readonly findings: readonly ExportFinding[];
  readonly totals: {
    readonly approvedCents: number;
    readonly pendingCount: number;
    readonly findingCount: number;
  };
};

export type ExportRow = readonly Cell[];

export type ExportTable = {
  readonly header: readonly string[];
  readonly rows: readonly ExportRow[];
  readonly totals: readonly ExportRow[];
  readonly summary: readonly (readonly [string, Cell])[];
};

export const EXPORT_HEADER: readonly string[] = [
  "Supplier",
  "Invoice",
  "Check",
  "Action",
  "Finding",
  "Amount (USD)",
  "Calculation",
  "Evidence",
  "Decision",
  "Reason",
  "Decided at (UTC)",
];

export const AMOUNT_COLUMN = EXPORT_HEADER.indexOf("Amount (USD)");

const text = (value: string): Cell => ({ kind: "text", value });
const money = (cents: number): Cell => ({ kind: "money", cents });
const count = (value: number): Cell => ({ kind: "count", value });
const EMPTY: Cell = { kind: "empty" };

const decisionCells = (decision: DecisionState): readonly Cell[] =>
  decision.status === "pending"
    ? [text(DECISION_LABEL.pending), EMPTY, EMPTY]
    : [
        text(DECISION_LABEL[decision.status]),
        decision.status === "rejected" && decision.reason !== null
          ? text(decision.reason)
          : EMPTY,
        text(utcMinute(decision.decidedAt)),
      ];

const findingRow = (finding: ExportFinding): ExportRow => [
  text(finding.supplierName),
  text(finding.invoiceNumber),
  text(CHECK_LABEL[finding.checkId]),
  text(ACTION_LABEL[finding.action]),
  text(finding.title),
  money(finding.amountCents),
  text(finding.calculation),
  text(citationsFor(finding)),
  ...decisionCells(finding.decision),
];

/** The label in the Supplier column, the amount in the Amount column, every other cell empty. */
const totalRow = (label: string, cents: number): ExportRow =>
  EXPORT_HEADER.map((_, index) => {
    if (index === 0) return text(label);
    return index === AMOUNT_COLUMN ? money(cents) : EMPTY;
  });

const summaryPairs = (
  snapshot: ExportSnapshot,
  now: number,
): ExportTable["summary"] => [
  ["Audit run finished (UTC)", text(utcMinute(snapshot.run.finishedAt))],
  ["Exported at (UTC)", text(utcMinute(now))],
  ["Invoices checked", count(snapshot.run.invoiceCount)],
  ["Invoiced total", money(snapshot.run.invoicedTotalCents)],
  ["Findings", count(snapshot.run.findingCount)],
  ["Recoverable", money(snapshot.headline.recoverableCents)],
  ["Approved", money(snapshot.totals.approvedCents)],
  [
    "Pending",
    text(`${snapshot.totals.pendingCount} of ${snapshot.totals.findingCount}`),
  ],
  ["% of invoiced", text(snapshot.headline.recoverableShare)],
];

/** Header, one row per finding in snapshot order, the two total rows and the Summary pairs. */
export const exportTable = (
  snapshot: ExportSnapshot,
  now: number,
): ExportTable => ({
  header: EXPORT_HEADER,
  rows: snapshot.findings.map(findingRow),
  totals: [
    totalRow("Total recoverable", snapshot.headline.recoverableCents),
    totalRow("Total approved", snapshot.totals.approvedCents),
  ],
  summary: summaryPairs(snapshot, now),
});

/** A cell as the text a reader sees; money as a plain decimal, a count as its digits. */
export const cellText = (cell: Cell): string => {
  if (cell.kind === "text") return cell.value;
  if (cell.kind === "count") return String(cell.value);
  return cell.kind === "money" ? centsToPlain(cell.cents) : "";
};
