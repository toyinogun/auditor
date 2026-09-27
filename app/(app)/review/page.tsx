import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Money } from "@/components/money";
import { SummaryTile } from "@/components/summary-tile";
import type { Headline } from "@/lib/audit/headline";
import {
  readReview,
  reviewTotals,
  type ReviewSelection,
  type ReviewTotals,
} from "@/lib/audit/review";
import { SAMPLE_MANIFEST } from "@/lib/audit/sample";
import type { FindingView } from "@/lib/db/audit";
import { getDb } from "@/lib/db/client";
import type { DocumentKind } from "@/lib/schemas/enums";
import { cn } from "@/lib/utils";
import { FindingDetail } from "./_components/finding-detail";
import { FindingsTable } from "./_components/findings-table";

export const metadata: Metadata = { title: "Review" };

/**
 * The review screen (spec 0008): the tiles, then the findings table beside the selected
 * finding's invoice, evidence and decision bar. The selection lives in `?finding=<key>`, so a
 * reload keeps it; with no run yet it shows spec 0007's empty state.
 */
export default async function ReviewPage({
  searchParams,
}: PageProps<"/review">) {
  await connection();
  const { finding } = await searchParams;
  const requestedKey = typeof finding === "string" ? finding : null;
  const { headline, findings, invoiceCount, selection } = readReview(
    getDb(),
    requestedKey,
  );
  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-headline-lg">Review</h1>
      {headline === null ? (
        <NoAudit />
      ) : (
        <>
          <Tiles headline={headline} totals={reviewTotals(findings)} />
          {selection === null ? (
            <NoFindings invoiceCount={invoiceCount} />
          ) : (
            <SplitPane
              findings={findings}
              selection={selection}
              requestedKey={requestedKey}
            />
          )}
        </>
      )}
    </div>
  );
}

function Tiles({
  headline,
  totals,
}: {
  readonly headline: Headline;
  readonly totals: ReviewTotals;
}) {
  return (
    <section
      aria-label="Audit summary"
      className="grid grid-cols-2 gap-3 md:grid-cols-5"
    >
      <SummaryTile
        label="Recoverable"
        variant="recoverable"
        className="col-span-2"
      >
        <Money cents={headline.recoverableCents} size="display" />
      </SummaryTile>
      <SummaryTile label="Approved">
        <Money cents={totals.approvedCents} size="lg" />
      </SummaryTile>
      <SummaryTile label="Pending">
        {totals.pendingCount} of {totals.findingCount}
      </SummaryTile>
      <SummaryTile label="% of invoiced">
        {headline.recoverableShare}
      </SummaryTile>
    </section>
  );
}

/** Table and detail side by side from 1024px; below that, one or the other (AC-14). */
function SplitPane({
  findings,
  selection,
  requestedKey,
}: {
  readonly findings: readonly FindingView[];
  readonly selection: ReviewSelection;
  readonly requestedKey: string | null;
}) {
  const { finding: selected, view } = selection;
  // Any `finding` param opens the detail on narrow screens (AC-14); an unknown one says so there too.
  const showDetail = requestedKey !== null;
  const unknownSelection = showDetail && !selection.requested;
  return (
    <div className="grid grid-cols-1 gap-gutter lg:grid-cols-12 lg:items-start">
      <div className={cn("lg:col-span-5", showDetail && "hidden lg:block")}>
        <FindingsTable
          findings={findings}
          selectedKey={selected.findingKey}
          unknownSelection={unknownSelection}
        />
      </div>
      <div className={cn("lg:col-span-7", !showDetail && "hidden lg:block")}>
        <FindingDetail
          finding={selected}
          view={view}
          findingKeys={findings.map((f) => f.findingKey)}
          unknownSelection={unknownSelection}
        />
      </div>
    </div>
  );
}

function NoFindings({ invoiceCount }: { readonly invoiceCount: number }) {
  return (
    <section
      aria-labelledby="no-findings"
      className="flex max-w-measure flex-col gap-2 rounded-md border border-border px-8 py-12"
    >
      <h2 id="no-findings" className="type-headline-md">
        No overpayments found
      </h2>
      <p className="text-on-surface-muted">
        Checked {invoiceCount} {invoiceCount === 1 ? "invoice" : "invoices"}.
      </p>
    </section>
  );
}

const countOf = (kind: DocumentKind): number =>
  SAMPLE_MANIFEST.files.filter((file) => file.kind === kind).length;

const CSV_KINDS: readonly DocumentKind[] = ["receipts_csv", "payments_csv"];

/** "2 contracts, 4 purchase orders, 6 invoices and 2 CSVs", counted from the sample manifest. */
const sampleContents = (): string => {
  const csvs = CSV_KINDS.reduce((total, kind) => total + countOf(kind), 0);
  return (
    `${countOf("contract")} contracts, ${countOf("purchase_order")} purchase orders, ` +
    `${countOf("invoice")} invoices and ${csvs} CSVs`
  );
};

function NoAudit() {
  return (
    <section
      aria-labelledby="no-audit"
      className="flex max-w-measure flex-col gap-2 rounded-md border border-border px-8 py-12"
    >
      <h2 id="no-audit" className="type-headline-md">
        No audit yet
      </h2>
      <p className="text-on-surface-muted">
        Press Load sample data in the bar above to audit the fictional sample:{" "}
        {sampleContents()}. It takes a second and needs no API key.
      </p>
      <p className="text-on-surface-muted">
        Or <Link href="/documents">upload documents</Link> on the Documents
        page.
      </p>
    </section>
  );
}
