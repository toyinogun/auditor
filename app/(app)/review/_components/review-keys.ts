/**
 * The review screen's keyboard (spec 0008, AC-11): ↑ ↓ move the selection, A approves, R opens
 * the reject dialog. Pure, so the guards are unit tested; `review-keyboard.ts` wires it to the DOM.
 */

export type ReviewCommand = "previous" | "next" | "approve" | "reject";

export type KeyPress = {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  /** Focus is in an input, textarea, select or contenteditable. */
  readonly inField: boolean;
  /** A dialog or menu is open. */
  readonly overlayOpen: boolean;
  readonly saving: boolean;
};

const COMMANDS: Readonly<Record<string, ReviewCommand>> = {
  arrowup: "previous",
  arrowdown: "next",
  a: "approve",
  r: "reject",
};

export const commandFor = (press: KeyPress): ReviewCommand | null => {
  const blocked =
    press.ctrlKey ||
    press.metaKey ||
    press.altKey ||
    press.inField ||
    press.overlayOpen ||
    press.saving;
  return blocked ? null : (COMMANDS[press.key.toLowerCase()] ?? null);
};

/** The row above or below `current`, or null at either end or when `current` is not listed. */
export const neighbourKey = (
  keys: readonly string[],
  current: string,
  direction: "previous" | "next",
): string | null => {
  const index = keys.indexOf(current);
  if (index === -1) return null;
  return keys[direction === "previous" ? index - 1 : index + 1] ?? null;
};

type Target = {
  readonly tagName: string;
  readonly isContentEditable: boolean;
} | null;

const FIELD_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export const isEditable = (target: Target): boolean =>
  target !== null &&
  (target.isContentEditable || FIELD_TAGS.has(target.tagName));
