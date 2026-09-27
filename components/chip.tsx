import {
  CheckIcon,
  CircleIcon,
  ClockIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Status chip (spec 0007, AC-8). Every state carries a word and an icon, never color alone.
 * Upload statuses reuse these looks with their own words through `label`.
 */

export type ChipState = "pending" | "approved" | "rejected" | "working";

type ChipProps = {
  readonly state: ChipState;
  readonly label?: string;
  /** Swaps the working clock for a spinner (uploading). */
  readonly spin?: boolean;
  readonly className?: string;
};

const STATE_CLASS: Readonly<Record<ChipState, string>> = {
  pending: "bg-neutral-well text-on-surface-muted",
  approved: "bg-secondary text-primary-deeper",
  rejected: "bg-error-wash text-error",
  working: "bg-tertiary-wash text-tertiary-deep",
};

const STATE_ICON = {
  pending: CircleIcon,
  approved: CheckIcon,
  rejected: XIcon,
  working: ClockIcon,
} as const;

export function Chip({ state, label, spin = false, className }: ChipProps) {
  const Icon =
    state === "working" && spin ? LoaderCircleIcon : STATE_ICON[state];
  return (
    <span
      data-slot="chip"
      data-state={state}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-sm px-1.5 type-label-md whitespace-nowrap",
        "transition-colors duration-(--duration-quick) ease-out",
        STATE_CLASS[state],
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={2}
        className={cn(
          "size-3.5 shrink-0",
          spin && state === "working" && "animate-spin",
        )}
      />
      {label ?? state}
    </span>
  );
}
