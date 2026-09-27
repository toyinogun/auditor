import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Chip } from "@/components/chip";
import { Money } from "@/components/money";
import { SummaryTile } from "@/components/summary-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { env } from "@/lib/env";
import { Overlays } from "./_components/overlays";
import { TokenValue } from "./_components/token-value";

export const metadata: Metadata = {
  title: "Styleguide",
  robots: { index: false },
};

/**
 * The internal showcase (spec 0007, AC-9): every token and every component state. Decided per
 * request, and a 404 on the public demo. Not linked from the app bar.
 */

const COLORS = [
  "primary",
  "primary-hover",
  "primary-deep",
  "primary-deeper",
  "secondary",
  "tertiary",
  "tertiary-soft",
  "tertiary-wash",
  "tertiary-deep",
  "surface",
  "on-surface",
  "on-surface-muted",
  "outline",
  "border",
  "neutral",
  "neutral-well",
  "error",
  "error-wash",
] as const;

/** Written out so Tailwind sees each class. */
const SWATCH: Readonly<Record<(typeof COLORS)[number], string>> = {
  primary: "bg-primary",
  "primary-hover": "bg-primary-hover",
  "primary-deep": "bg-primary-deep",
  "primary-deeper": "bg-primary-deeper",
  secondary: "bg-secondary",
  tertiary: "bg-tertiary",
  "tertiary-soft": "bg-tertiary-soft",
  "tertiary-wash": "bg-tertiary-wash",
  "tertiary-deep": "bg-tertiary-deep",
  surface: "bg-surface",
  "on-surface": "bg-on-surface",
  "on-surface-muted": "bg-on-surface-muted",
  outline: "bg-outline",
  border: "bg-border",
  neutral: "bg-neutral",
  "neutral-well": "bg-neutral-well",
  error: "bg-error",
  "error-wash": "bg-error-wash",
};

const TYPE_ROLES = [
  ["display-xl", "type-display-xl", "$9,766.85"],
  ["display", "type-display", "$9,766.85"],
  ["headline-lg", "type-headline-lg", "Review"],
  ["headline-md", "type-headline-md", "NL-88310 · Northline Industrial Supply"],
  ["headline-sm", "type-headline-sm", "Overpayment Auditor"],
  [
    "body-lg",
    "type-body-lg",
    "It read 12 documents and found the overpayments.",
  ],
  ["body-md", "type-body-md", "Every invoice is checked against its contract."],
  ["body-sm", "type-body-sm", "Runs on fictional sample data."],
  ["label-md", "type-label-md", "Load sample data"],
  ["label-caps", "type-label-caps", "Recoverable"],
  [
    "caption",
    "type-caption",
    "Invoice NL-88310.pdf, line 1 · Contract C-2026-014.pdf, clause 4.2",
  ],
  ["data-lg", "type-data-lg", "18.1%"],
  ["data-md", "type-data-md", "($5.10 − $4.85) × 1,500 = $375.00"],
  ["data-md-strong", "type-data-md-strong", "NL88310"],
] as const;

const RADII = [
  ["none", "rounded-none"],
  ["xs", "rounded-xs"],
  ["sm", "rounded-sm"],
  ["md", "rounded-md"],
  ["lg", "rounded-lg"],
  ["full", "rounded-full"],
] as const;

/** Sample rows from the brief's expected findings, largest first. */
const ROWS = [
  ["NL88310", "Duplicate, paid twice", 814100, "pending"],
  ["NL-88203", "Billed, not received", 39000, "approved"],
  ["NL-88310", "Price above contract", 37500, "pending"],
  ["BW-5521", "Surcharge not permitted", 31110, "rejected"],
] as const;
const SELECTED_ROW = 2;

export default async function StyleguidePage() {
  await connection();
  if (env.DEMO_MODE) notFound();
  return (
    <main className="mx-auto flex w-full max-w-app flex-col gap-16 px-page py-12">
      <header className="flex flex-col gap-2">
        <h1 className="type-headline-lg">Styleguide</h1>
        <p className="max-w-measure text-on-surface-muted">
          Highlighter Ledger, as shipped. Values are read from the live CSS; the
          drift test keeps them equal to DESIGN.md.
        </p>
      </header>

      <Section title="Color">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {COLORS.map((name) => (
            <li key={name} className="flex flex-col gap-2">
              <span
                className={`h-16 rounded-md border border-border ${SWATCH[name]}`}
              />
              <span className="type-label-md">{name}</span>
              <TokenValue name={`--color-${name}`} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type">
        <ul className="flex flex-col">
          {TYPE_ROLES.map(([role, className, sample]) => (
            <li
              key={role}
              className="grid grid-cols-1 items-baseline gap-2 border-b border-border py-4 md:grid-cols-[12rem_1fr]"
            >
              <span className="type-data-md text-on-surface-muted">{role}</span>
              <span className={className}>{sample}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Radius">
        <ul className="flex flex-wrap gap-6">
          {RADII.map(([name, className]) => (
            <li key={name} className="flex flex-col items-center gap-2">
              <span
                className={`size-16 border border-outline bg-neutral ${className}`}
              />
              <span className="type-label-md">{name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-col gap-4">
          <ButtonRow />
          <ButtonRow disabled />
          <p className="type-caption text-on-surface-muted">
            Hover a button for its hover fill; press Tab to see the focus ring.
          </p>
        </div>
      </Section>

      <Section title="Fields">
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 type-label-md">
            Supplier
            <Input placeholder="Northline Industrial Supply" />
          </label>
          <label className="flex flex-col gap-1.5 type-label-md">
            Invalid
            <Input aria-invalid="true" defaultValue="NL-8831O" />
          </label>
          <label className="flex flex-col gap-1.5 type-label-md sm:col-span-2">
            Reason
            <Textarea placeholder="Credit note CN-12 issued" />
          </label>
        </div>
      </Section>

      <Section title="Chips">
        <div className="flex flex-wrap items-center gap-3">
          <Chip state="pending" />
          <Chip state="approved" />
          <Chip state="rejected" />
          <Chip state="working" />
          <Chip state="working" label="uploading" spin />
          <Chip state="approved" label="already ingested" />
          <Chip state="rejected" label="refused" />
        </div>
      </Section>

      <Section title="Summary tiles">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <SummaryTile
            label="Recoverable"
            variant="recoverable"
            className="col-span-2"
          >
            <Money cents={976685} size="display" />
          </SummaryTile>
          <SummaryTile label="Approved">
            <Money cents={0} size="lg" />
          </SummaryTile>
          <SummaryTile label="Pending">8</SummaryTile>
          <SummaryTile label="% of invoiced">18.1%</SummaryTile>
        </div>
      </Section>

      <Section title="Table">
        <div className="max-w-3xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Finding</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map(([invoice, type, cents, state], index) => (
                <TableRow
                  key={`${invoice}-${type}`}
                  data-selected={index === SELECTED_ROW || undefined}
                >
                  <TableCell className="type-data-md">{invoice}</TableCell>
                  <TableCell>{type}</TableCell>
                  <TableCell>
                    <Chip state={state} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money cents={cents} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Floating">
        <Overlays />
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 type-headline-md">{title}</h2>
      {children}
    </section>
  );
}

function ButtonRow({ disabled = false }: { readonly disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled={disabled}>Approve</Button>
      <Button variant="secondary" disabled={disabled}>
        Reject…
      </Button>
      <Button variant="destructive" disabled={disabled}>
        Reject finding
      </Button>
      <Button variant="secondary" size="sm" disabled={disabled}>
        Retry
      </Button>
      <span className="type-caption text-on-surface-muted">
        {disabled ? "disabled" : "default"}
      </span>
    </div>
  );
}
