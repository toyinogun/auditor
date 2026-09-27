/** Pure pieces of the decision bar and reject dialog (spec 0008, AC-7 to AC-12). */

export const REASON_REQUIRED = "Enter a reason to reject this finding.";

export const STALE_FINDING =
  "The finding you chose changed since the page loaded. Nothing was saved, and the list has been refreshed.";

export const NOT_SAVED = "This decision was not saved. Try again.";

export const UNREACHABLE = "Could not reach the server. Try again.";

/** The review URL that selects one finding. */
export const findingHref = (findingKey: string): string =>
  `/review?finding=${encodeURIComponent(findingKey)}`;

/** The dialog's own check before any action call; the server checks again. */
export const reasonProblem = (reason: string): string | null =>
  reason.trim().length === 0 ? REASON_REQUIRED : null;

/** An alert on the decision bar, tied to the finding the analyst tried to decide. */
export type BarAlert = {
  readonly text: string;
  readonly raisedFor: string;
  /** The finding is gone, so the page has already fallen back to another one. */
  readonly stale: boolean;
};

type Selection = {
  readonly findingKey: string;
  /** The `finding` search param as the URL holds it now. */
  readonly findingParam: string | null;
};

/**
 * Whether the bar shows its alert. A stale alert stays while the URL still names the missing
 * finding (the page shows its fallback) and goes once another row is picked; any other alert
 * shows only on the finding it was raised for.
 */
export const alertShows = (
  alert: BarAlert | null,
  { findingKey, findingParam }: Selection,
): boolean => {
  if (alert === null) return false;
  return alert.stale
    ? findingParam === alert.raisedFor
    : findingKey === alert.raisedFor;
};
