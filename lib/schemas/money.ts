import { err, ok, type Result } from "./result";

/** A printed amount: up to 9 whole digits, up to 2 decimals, no sign, symbol or separator. */
export const MONEY_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

/** A printed percent: up to 3 whole digits, up to 2 decimals ("2.5" means 2.5%). */
export const RATE_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

const CENTS_PER_UNIT = 100;
const BPS_PER_PERCENT = 100;
const BPS_PER_WHOLE = 10_000;

/** Reads "12.3" as 1230 hundredths, without touching floating point. */
const toHundredths = (text: string): number => {
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};

/** Parses a printed money string into integer cents. `field` names the value in the error. */
export const parseMoney = (text: string, field: string): Result<number> =>
  MONEY_PATTERN.test(text)
    ? ok(toHundredths(text))
    : err(`${field}: "${text}" is not a plain amount like 1234.56`);

/** Parses a printed percent string into integer basis points ("2.5" becomes 250). */
export const parseRate = (text: string, field: string): Result<number> => {
  if (!RATE_PATTERN.test(text)) {
    return err(`${field}: "${text}" is not a plain percent like 2.5`);
  }
  const bps = toHundredths(text);
  return bps <= BPS_PER_WHOLE
    ? ok(bps)
    : err(`${field}: ${text}% is above 100%`);
};

/** `bps` basis points of `cents`, rounded half away from zero to the cent. The only rounding in the app. */
export const percentOfCents = (cents: number, bps: number): number => {
  const product = Math.abs(cents * bps);
  const whole = Math.floor(product / BPS_PER_WHOLE);
  const rounded =
    (product % BPS_PER_WHOLE) * 2 >= BPS_PER_WHOLE ? whole + 1 : whole;
  return cents * bps < 0 && rounded > 0 ? -rounded : rounded;
};

/** Formats cents as US dollars: 976685 becomes "$9,766.85". */
export const formatCents = (cents: number): string => {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / CENTS_PER_UNIT).toLocaleString("en-US");
  const rest = String(abs % CENTS_PER_UNIT).padStart(2, "0");
  return `${sign}$${dollars}.${rest}`;
};

/** Formats basis points as a percent: 250 becomes "2.5%". */
export const formatBps = (bps: number): string => `${bps / BPS_PER_PERCENT}%`;
