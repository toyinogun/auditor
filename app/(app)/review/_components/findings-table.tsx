import Link from "next/link";
import { Chip } from "@/components/chip";
import { Money } from "@/components/money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FindingView } from "@/lib/db/audit";
import { findingHref } from "./decision";

/**
 * The findings table (spec 0008, AC-2, AC-3, AC-11): largest first, one stretched link per row
 * so the whole row is the click target while only the invoice number takes focus.
 */

type FindingsTableProps = {
  readonly findings: readonly FindingView[];
  readonly selectedKey: string;
  /** A `finding` param named a finding that is not in this run (AC-3). */
  readonly unknownSelection: boolean;
};

export function FindingsTable({
  findings,
  selectedKey,
  unknownSelection,
}: FindingsTableProps) {
  return (
    <div className="flex flex-col gap-3">
      <Table aria-label="Findings">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Supplier</TableHead>
            <TableHead scope="col">Invoice</TableHead>
            <TableHead scope="col">Finding</TableHead>
            <TableHead scope="col">Decision</TableHead>
            <TableHead scope="col" className="text-right">
              Amount
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {findings.map((finding) => {
            const selected = finding.findingKey === selectedKey;
            return (
              <TableRow
                key={finding.findingKey}
                data-finding-row=""
                data-selected={selected || undefined}
                aria-current={selected ? "true" : undefined}
                className="relative cursor-pointer"
              >
                <TableCell className="max-w-36 truncate text-on-surface-muted">
                  {finding.supplierName}
                </TableCell>
                <TableCell className="type-data-md whitespace-nowrap">
                  <Link
                    href={findingHref(finding.findingKey)}
                    scroll={false}
                    className="text-on-surface no-underline after:absolute after:inset-0 hover:underline"
                  >
                    {finding.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell className="py-2">{finding.title}</TableCell>
                <TableCell>
                  <Chip state={finding.decision.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Money cents={finding.amountCents} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {unknownSelection && (
        <p className="type-caption text-on-surface-muted">
          That finding is not in the current audit.
        </p>
      )}
      <p className="hidden type-caption text-on-surface-muted lg:block">
        ↑ ↓ move · A approve · R reject
      </p>
    </div>
  );
}
