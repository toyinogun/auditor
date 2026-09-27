import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Button (spec 0007, AC-7), restyled to DESIGN.md: Harbour Ink on Light Sea Green, never white.
 * One primary per region; a second competing action is secondary. Destructive appears only as
 * the confirm button inside a confirm dialog.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md whitespace-nowrap type-label-md select-none",
    "transition-colors duration-(--duration-quick) ease-out",
    "disabled:cursor-not-allowed disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-on-surface hover:bg-primary-hover active:bg-primary-hover disabled:hover:bg-primary",
        secondary:
          "border border-outline bg-surface text-on-surface hover:bg-neutral-well disabled:hover:bg-surface",
        destructive:
          "bg-error text-surface hover:bg-error/90 disabled:hover:bg-error",
        ghost:
          "text-on-surface-muted hover:bg-neutral-well hover:text-on-surface disabled:hover:bg-transparent",
      },
      size: {
        md: "h-9 px-4",
        sm: "h-7 gap-1.5 px-2.5",
      },
    },
    compoundVariants: [
      { variant: "ghost", size: "md", className: "w-9 px-0" },
      { variant: "ghost", size: "sm", className: "w-7 px-0" },
    ],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { readonly asChild?: boolean };

function Button({
  className,
  variant,
  size,
  asChild = false,
  type = "button",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
