import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Money } from "@/components/money";
import { SummaryTile } from "@/components/summary-tile";
import { latestHeadline, type Headline } from "@/lib/audit/headline";
import { SAMPLE_MANIFEST } from "@/lib/audit/sample";
import { getDb } from "@/lib/db/client";
import type { DocumentKind } from "@/lib/schemas/enums";

export const metadata: Metadata = { title: "Review" };

/**
 * The review screen's first slice (spec 0007, AC-11): the headline tiles for the latest run, or
 * the empty state. Feature 10 grows it into the findings table and detail panel.
 */
export default async function ReviewPage() {
  await connection();
  const headline = latestHeadline(getDb());
  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-headline-lg">Review</h1>
      {headline === null ? <NoAudit /> : <Headline headline={headline} />}
    </div>
  );
}

function Headline({ headline }: { readonly headline: Headline }) {
  const findings = headline.findingCount === 1 ? "finding" : "findings";
  return (
    <>
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
        <SummaryTile label="Findings">{headline.findingCount}</SummaryTile>
        <SummaryTile label="% of invoiced">
          {headline.recoverableShare}
        </SummaryTile>
      </section>
      <p className="max-w-measure text-on-surface-muted">
        {headline.findingCount} {findings},{" "}
        <Money cents={headline.recoverableCents} className="text-on-surface" />{" "}
        recoverable of{" "}
        <Money
          cents={headline.invoicedTotalCents}
          className="text-on-surface"
        />{" "}
        invoiced. <Link href="/documents">See the documents behind it</Link>
      </p>
    </>
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
