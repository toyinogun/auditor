/** How the export writes money, times and its file name (spec 0009, AC-6, AC-7, AC-10). */

const CENTS_PER_DOLLAR = 100;
/** `YYYY-MM-DDTHH:MM` is the first 16 characters of an ISO string. */
const ISO_MINUTE_LENGTH = 16;
const ISO_DATE_LENGTH = 10;

/** Integer cents as a plain decimal, built from strings so no float is involved: 5 → "0.05". */
export const centsToPlain = (cents: number): string => {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / CENTS_PER_DOLLAR);
  const rest = String(abs % CENTS_PER_DOLLAR).padStart(2, "0");
  return `${sign}${dollars}.${rest}`;
};

/** Epoch ms as `YYYY-MM-DD HH:MM` in UTC. */
export const utcMinute = (ms: number): string =>
  new Date(ms).toISOString().slice(0, ISO_MINUTE_LENGTH).replace("T", " ");

/** `overpayment-findings-<UTC date>.<format>`. */
export const exportFileName = (format: string, now: number): string =>
  `overpayment-findings-${new Date(now).toISOString().slice(0, ISO_DATE_LENGTH)}.${format}`;
