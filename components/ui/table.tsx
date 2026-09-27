import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Table (spec 0007, AC-7), built like a spreadsheet done well: a `type-label-caps` header on
 * Canvas at 32px, 36px rows split by 1px Rule lines, no zebra striping. A row with
 * `data-selected` turns Frozen Water with a 2px Deep Lagoon left edge.
 */

function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom border-collapse type-body-md",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "bg-neutral [&_tr]:border-b [&_tr]:border-border",
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />;
}

function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-border [&_td]:type-data-md-strong",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-colors duration-(--duration-quick) ease-out",
        "[tbody_&]:hover:bg-neutral",
        "data-selected:bg-secondary data-selected:hover:bg-secondary",
        "data-selected:[&>*:first-child]:shadow-[inset_2px_0_0_var(--color-primary-deep)]",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-8 px-3 text-left align-middle type-label-caps whitespace-nowrap text-on-surface-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("h-row-height px-3 align-middle", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        "mt-3 text-left type-caption text-on-surface-muted",
        className,
      )}
      {...props}
    />
  );
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
