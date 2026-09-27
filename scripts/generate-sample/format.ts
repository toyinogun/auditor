import { isCalendarDate } from "../../lib/schemas/dates";
import { formatCents, parseMoney } from "../../lib/schemas/money";

/**
 * Printed forms (spec 0003, Value sourcing). Pure and independent of the machine's locale and
 * timezone: dates are handled in UTC, grouping is fixed to en US. The fixture has already passed
 * `validateSample`, so an unreadable value here is a bug and throws.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MS_PER_DAY = 86_400_000;

/** Invoice terms: Net 30 (spec 0003, AC-9). */
export const PAYMENT_TERM_DAYS = 30;

const toUtcDate = (isoDate: string): Date => {
  if (!isCalendarDate(isoDate)) {
    throw new Error(`format: "${isoDate}" is not a YYYY-MM-DD date`);
  }
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** "2026-04-03" becomes "April 3, 2026". */
export const formatLongDate = (isoDate: string): string => {
  const date = toUtcDate(isoDate);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
};

/** The YYYY-MM-DD date `days` after `isoDate`, in UTC. */
export const addDays = (isoDate: string, days: number): string =>
  toIsoDate(new Date(toUtcDate(isoDate).getTime() + days * MS_PER_DAY));

/** The Net 30 due date for an invoice date. */
export const dueDate = (invoiceDate: string): string =>
  addDays(invoiceDate, PAYMENT_TERM_DAYS);

/** Noon UTC on the document's date: the fixed PDF CreationDate and ModDate. */
export const infoDate = (isoDate: string): Date =>
  new Date(toUtcDate(isoDate).getTime() + MS_PER_DAY / 2);

/** 2000 becomes "2,000" (en US grouping, fixed). */
export const formatQuantity = (quantity: number): string =>
  String(quantity).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Printed money text to cents; throws because the fixture was validated first. */
export const cents = (text: string): number => {
  const parsed = parseMoney(text, "amount");
  if (!parsed.ok) throw new Error(`format: ${parsed.error}`);
  return parsed.value;
};

/** "15600.50" becomes "$15,600.50", through cents, never a float. */
export const formatMoney = (text: string): string => formatCents(cents(text));
