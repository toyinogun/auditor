import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Shared field look (spec 0007, AC-7): White, Pencil outline, `rounded-sm`; invalid is Rust. */
const FIELD =
  "w-full min-w-0 rounded-sm border border-outline bg-surface px-3 type-body-md text-on-surface transition-colors duration-(--duration-quick) ease-out placeholder:text-on-surface-muted disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-error";

function Input({
  className,
  type = "text",
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(FIELD, "h-9", className)}
      {...props}
    />
  );
}

export { FIELD, Input };
