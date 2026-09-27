import type { ReactNode } from "react";
import { Money } from "@/components/money";
import { formatQuantity } from "@/lib/checks/evidence";
import type {
  HeaderField,
  Highlights,
  InvoiceView,
  LineFigure,
} from "@/lib/checks/invoice-view";
import type { InvoiceChargeRecord } from "@/lib/schemas/records";
import { cn } from "@/lib/utils";

/**
 * The invoice drawn as paper (spec 0008, AC-4, AC-5): a square White sheet in the Desk well,
 * laid out like a printed invoice. Flagged lines take Amber Wash and the 3px Amber Glow marker;
 * the wrong figure takes the Honey swipe. The contract price and received quantity that prove it
 * stay plain. The only file on this screen allowed to use amber.
 */

type InvoicePaperProps = {
  readonly view: InvoiceView;
  readonly highlights: Highlights;
};

/** The Honey swipe on the one figure that is wrong. */
function Marked({
  marked,
  children,
}: {
  readonly marked: boolean;
  readonly children: ReactNode;
}) {
  if (!marked) return <>{children}</>;
  return (
    <mark className="rounded-xs bg-tertiary-soft px-0.5 type-data-md-strong text-on-surface">
      <span className="sr-only">Flagged: </span>
      {children}
    </mark>
  );
}

/** A value that does not exist: a dash on screen, "none" to a screen reader. */
function None() {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">none</span>
    </>
  );
}

const NUMBER_CELL =
  "px-2 py-2 text-right align-top type-data-md whitespace-nowrap";

/** The first cell of a line: carries the Amber Glow marker when the line is flagged. */
function LineCell({
  flagged,
  children,
}: {
  readonly flagged: boolean;
  readonly children: ReactNode;
}) {
  return (
    <td className="relative py-2 pr-2 pl-3 align-top">
      {flagged && (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-[3px] rounded-xs bg-tertiary"
          />
          <span className="sr-only">Flagged line. </span>
        </>
      )}
      {children}
    </td>
  );
}

function HeaderFacts({
  view,
  header,
}: {
  readonly view: InvoiceView;
  readonly header: ReadonlySet<HeaderField>;
}) {
  const { invoice } = view;
  const facts: readonly [string, HeaderField, ReactNode][] = [
    ["Invoice number", "invoiceNumber", invoice.invoiceNumber],
    ["Invoice date", "invoiceDate", invoice.invoiceDate],
    ["PO number", "poNumber", invoice.poNumber ?? "none"],
  ];
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
      <div className="flex flex-col gap-1">
        <p className="type-label-caps text-on-surface-muted">Invoice from</p>
        <p className="type-headline-sm">{invoice.supplierName}</p>
      </div>
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
        {facts.map(([label, field, value]) => (
          <div key={field} className="contents">
            <dt className="type-caption text-on-surface-muted">{label}</dt>
            <dd className="text-right type-data-md">
              <Marked marked={header.has(field)}>{value}</Marked>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const lineFigures = (
  highlights: Highlights,
  lineNo: number,
): ReadonlySet<LineFigure> | undefined => highlights.lines.get(lineNo);

function ItemRows({ view, highlights }: InvoicePaperProps) {
  return view.lines.map((line) => {
    const figures = lineFigures(highlights, line.lineNo);
    const flagged = figures !== undefined;
    const unitPriceMarked = figures?.has("unitPrice") ?? false;
    return (
      <tr
        key={`line-${line.lineNo}`}
        data-flagged={flagged || undefined}
        className={cn("border-b border-border", flagged && "bg-tertiary-wash")}
      >
        <LineCell flagged={flagged}>
          <span className="flex gap-2">
            <span className="type-data-md text-on-surface-muted">
              {line.lineNo}
            </span>
            <span className="flex flex-col">
              <span className="type-body-sm">{line.description}</span>
              <span className="type-data-md whitespace-nowrap text-on-surface-muted">
                {line.sku}
              </span>
            </span>
          </span>
        </LineCell>
        <td className={NUMBER_CELL}>
          <Marked marked={figures?.has("quantity") ?? false}>
            {formatQuantity(line.quantity)}
          </Marked>
        </td>
        <td className={NUMBER_CELL}>
          {line.receivedQuantity === null ? (
            <None />
          ) : (
            formatQuantity(line.receivedQuantity)
          )}
        </td>
        <td className={NUMBER_CELL}>
          <Marked marked={unitPriceMarked}>
            <Money cents={line.unitPriceCents} strong={unitPriceMarked} />
          </Marked>
        </td>
        <td className={NUMBER_CELL}>
          {line.contractPriceCents === null ? (
            <None />
          ) : (
            <Money cents={line.contractPriceCents} />
          )}
        </td>
        <td className={NUMBER_CELL}>
          <Money cents={line.amountCents} />
        </td>
      </tr>
    );
  });
}

function ChargeRow({
  charge,
  flagged,
}: {
  readonly charge: InvoiceChargeRecord;
  readonly flagged: boolean;
}) {
  return (
    <tr
      data-flagged={flagged || undefined}
      className={cn("border-b border-border", flagged && "bg-tertiary-wash")}
    >
      <LineCell flagged={flagged}>
        <span className="type-body-sm">{charge.label}</span>
      </LineCell>
      <td className={NUMBER_CELL} />
      <td className={NUMBER_CELL} />
      <td className={NUMBER_CELL} />
      <td className={NUMBER_CELL} />
      <td className={NUMBER_CELL}>
        <Marked marked={flagged}>
          <Money cents={charge.amountCents} strong={flagged} />
        </Marked>
      </td>
    </tr>
  );
}

const COLUMNS = [
  "Qty billed",
  "Qty received",
  "Unit price billed",
  "Contract price",
  "Amount",
] as const;

export function InvoicePaper({ view, highlights }: InvoicePaperProps) {
  const { invoice } = view;
  return (
    <div className="bg-neutral-well p-3 sm:p-6">
      <article
        aria-label={`Invoice ${invoice.invoiceNumber}`}
        className="flex flex-col gap-8 bg-surface p-4 text-on-surface sm:p-8"
      >
        <HeaderFacts view={view} header={highlights.header} />
        {/* `relative` keeps the absolutely placed sr-only labels inside the scroll box. */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-xl border-collapse">
            <caption className="sr-only">
              Invoice lines and charges, with the quantity received and the
              contract price for each line
            </caption>
            <thead>
              <tr className="border-b border-outline">
                <th
                  scope="col"
                  className="py-2 pr-2 pl-3 text-left type-label-caps text-on-surface-muted"
                >
                  Line
                </th>
                {COLUMNS.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="px-2 py-2 text-right type-label-caps text-on-surface-muted"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <ItemRows view={view} highlights={highlights} />
              {invoice.charges.map((charge) => (
                <ChargeRow
                  key={`charge-${charge.lineNo}`}
                  charge={charge}
                  flagged={highlights.charges.has(charge.lineNo)}
                />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th
                  scope="row"
                  colSpan={5}
                  className="pt-4 pr-2 text-right type-label-md text-on-surface-muted"
                >
                  Subtotal
                </th>
                <td className={cn(NUMBER_CELL, "pt-4")}>
                  <Money cents={invoice.subtotalCents} />
                </td>
              </tr>
              <tr>
                <th
                  scope="row"
                  colSpan={5}
                  className="pt-1 pr-2 text-right type-label-md"
                >
                  Total
                </th>
                <td className={cn(NUMBER_CELL, "pt-1")}>
                  <Marked marked={highlights.header.has("total")}>
                    <Money cents={invoice.totalCents} strong />
                  </Marked>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </article>
    </div>
  );
}
