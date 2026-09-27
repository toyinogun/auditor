import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { FIELD } from "./input";

/** Textarea (spec 0007, AC-7): the input look, growing with its content from about 3 lines. */
function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(FIELD, "field-sizing-content min-h-20 py-2", className)}
      {...props}
    />
  );
}

export { Textarea };
