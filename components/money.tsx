import { formatCents } from "@/lib/schemas/money";
import { cn } from "@/lib/utils";

/**
 * Money (spec 0007, AC-8): the only way an amount is rendered. Always mono with tabular figures
 * and cents, never abbreviated. `display` is the serif result figure, reserved for the
 * recoverable tile.
 */

type MoneySize = "md" | "lg" | "display";

type MoneyProps = {
  readonly cents: number;
  readonly size?: MoneySize;
  readonly strong?: boolean;
  readonly className?: string;
};

const SIZE_CLASS: Readonly<Record<MoneySize, string>> = {
  md: "type-data-md",
  lg: "type-data-lg",
  display: "type-display",
};

export function Money({
  cents,
  size = "md",
  strong = false,
  className,
}: MoneyProps) {
  const type =
    size === "md" && strong ? "type-data-md-strong" : SIZE_CLASS[size];
  return (
    <span
      data-slot="money"
      className={cn("whitespace-nowrap", type, className)}
    >
      {formatCents(cents)}
    </span>
  );
}
