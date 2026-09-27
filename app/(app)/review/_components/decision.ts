/** Pure pieces of the decision bar and reject dialog (spec 0008, AC-7 to AC-12). */

export const REASON_REQUIRED = "Enter a reason to reject this finding.";

export const STALE_FINDING =
  "This finding changed since the page loaded. The list has been refreshed.";

export const NOT_SAVED = "This decision was not saved. Try again.";

export const UNREACHABLE = "Could not reach the server. Try again.";

/** The review URL that selects one finding. */
export const findingHref = (findingKey: string): string =>
  `/review?finding=${encodeURIComponent(findingKey)}`;

/** The dialog's own check before any action call; the server checks again. */
export const reasonProblem = (reason: string): string | null =>
  reason.trim().length === 0 ? REASON_REQUIRED : null;
