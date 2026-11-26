/**
 * BQ / Activity Schedule rounding rule.
 *
 * All numbers shown on BQ/AS tables are whole numbers. A fractional part of
 * 0.4 or less rounds down to zero (truncated); any other fractional part uses
 * normal half-up rounding. Mapping / BIM model views keep two decimals.
 */
export const roundBqNumber = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  const fraction = abs - whole;
  const rounded = fraction <= 0.4 + 1e-9 ? whole : Math.round(abs);
  return value < 0 ? -rounded : rounded;
};

const group = (value: number) =>
  value.toLocaleString('en-HK', { maximumFractionDigits: 20 });

/** Whole number with thousands separators, applying the BQ rounding rule. */
export const formatBqNumber = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? '—' : group(roundBqNumber(value));

/** Quantities on BQ / Activity Schedule tables. */
export const formatBqQty = (value: number | null | undefined): string =>
  formatBqNumber(value);

/** Two decimals, used by mapping model / BIM quantities. */
export const formatTwoDecimals = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value)
    ? '—'
    : value.toLocaleString('en-HK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

export const formatMoneyValue = (value: number | null | undefined): string =>
  formatTwoDecimals(value);

/** Parse a user typed number, ignoring thousands separators. */
export const parseNumberInput = (raw: string): number | null => {
  const cleaned = raw.replace(/[,\s$]/g, '');
  if (!cleaned) return null;
  const next = Number(cleaned);
  return Number.isFinite(next) ? next : null;
};
