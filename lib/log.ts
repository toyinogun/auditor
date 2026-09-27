/**
 * Structured logging (spec 0001): one JSON line per event on stdout. Callers pass only counts,
 * ids and outcomes; never document text, extracted values or secrets (AGENTS.md).
 */

export type LogValue = string | number | boolean | null;

export type LogEvent = { readonly event: string } & Readonly<
  Record<string, LogValue>
>;

export const logEvent = (event: LogEvent): void => {
  process.stdout.write(
    `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`,
  );
};
