import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Summary tile (spec 0007, AC-8): a `label-caps` label over one figure, on Canvas with no border
 * or shadow. `recoverable` sits on Amber Wash with a 2px Amber Glow underline under its figure,
 * the one large element above the fold.
 */

type SummaryTileProps = {
  readonly label: string;
  readonly variant?: "default" | "recoverable";
  readonly className?: string;
  /** The figure: usually a `Money`, or a plain mono string such as `18.1%`. */
  readonly children: ReactNode;
};

export function SummaryTile({
  label,
  variant = "default",
  className,
  children,
}: SummaryTileProps) {
  const recoverable = variant === "recoverable";
  return (
    <div
      data-slot="summary-tile"
      data-variant={variant}
      className={cn(
        "flex flex-col justify-between gap-3 rounded-md p-4",
        recoverable ? "bg-tertiary-wash" : "bg-neutral",
        className,
      )}
    >
      <p className="type-label-caps text-on-surface-muted">{label}</p>
      {recoverable ? (
        <p className="self-start border-b-2 border-tertiary pb-1">{children}</p>
      ) : (
        <p className="type-data-lg text-on-surface">{children}</p>
      )}
    </div>
  );
}
