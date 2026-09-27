"use client";

import { useSyncExternalStore } from "react";

/** A CSS variable's computed value, read in the browser so the showcase shows what shipped. */
const subscribe = (): (() => void) => () => undefined;

export function TokenValue({ name }: { readonly name: string }) {
  const value = useSyncExternalStore(
    subscribe,
    () =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    () => "",
  );
  return <span className="type-data-md text-on-surface-muted">{value}</span>;
}
