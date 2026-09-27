"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { cn } from "@/lib/utils";

/** An app bar link that marks the current page with `aria-current` and an ink underline. */
export function NavLink({
  href,
  children,
}: {
  readonly href: Route;
  readonly children: string;
}) {
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center rounded-sm px-2 type-label-md no-underline",
        "transition-colors duration-(--duration-quick) ease-out",
        "decoration-2 underline-offset-[10px]",
        current
          ? "text-on-surface underline decoration-on-surface"
          : "text-on-surface-muted hover:text-on-surface",
      )}
    >
      {children}
    </Link>
  );
}
