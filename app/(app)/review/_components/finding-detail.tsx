import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { Chip } from "@/components/chip";
import { Money } from "@/components/money";
import {
  citationsFor,
  highlightsFor,
  type InvoiceView,
} from "@/lib/checks/invoice-view";
import type { FindingView } from "@/lib/db/audit";
import { DecisionBar } from "./decision-bar";
import { InvoicePaper } from "./invoice-paper";

/**
 * The detail panel (spec 0008, AC-4 to AC-7, AC-14): the invoice as paper with the wrong figures
 * marked, the calculation exactly as the checks stored it, its citations, then the decision bar.
 */

type FindingDetailProps = {
  readonly finding: FindingView;
  readonly view: InvoiceView;
  readonly findingKeys: readonly string[];
  /** The `finding` param matched nothing; on narrow screens the table and its caption are hidden. */
  readonly unknownSelection: boolean;
};

export function FindingDetail({
  finding,
  view,
  findingKeys,
  unknownSelection,
}: FindingDetailProps) {
  return (
    <section aria-labelledby="finding-heading" className="flex flex-col gap-5">
      <Link
        href="/review"
        className="inline-flex items-center gap-1.5 self-start type-label-md lg:hidden"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        All findings
      </Link>
      {unknownSelection && (
        <p className="type-caption text-on-surface-muted lg:hidden">
          That finding is not in the current audit.
        </p>
      )}
      <div className="flex flex-col gap-3">
        <h2 id="finding-heading" className="type-headline-md">
          <span className="font-mono">{finding.invoiceNumber}</span>
          <span className="text-on-surface-muted"> · </span>
          {finding.supplierName}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <p className="type-headline-sm">{finding.title}</p>
            <Chip state={finding.decision.status} />
          </div>
          <Money cents={finding.amountCents} size="lg" />
        </div>
      </div>

      <InvoicePaper view={view} highlights={highlightsFor(finding)} />

      <div className="flex flex-col gap-2">
        <p className="rounded-sm bg-neutral p-3 type-data-md break-words">
          <span className="sr-only">Calculation: </span>
          {finding.calculation}
        </p>
        <p className="type-caption text-on-surface-muted">
          <span className="sr-only">Sources: </span>
          {citationsFor(finding)}
        </p>
      </div>

      <DecisionBar
        findingKey={finding.findingKey}
        title={finding.title}
        amountCents={finding.amountCents}
        decision={finding.decision}
        findingKeys={findingKeys}
      />
    </section>
  );
}
