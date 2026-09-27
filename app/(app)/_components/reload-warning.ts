/** The reload guard's body text (spec 0007, AC-13), for N stored decisions (N is at least 1). */
export const reloadWarning = (decisionCount: number): string =>
  decisionCount === 1
    ? "This clears 1 saved decision (an approval or rejection) and starts a fresh audit."
    : `This clears ${decisionCount} saved decisions (approvals and rejections) and starts a fresh audit.`;
