// Small helpers of the playtime admin screens, kept free of dependencies so tests import them.

/**
 * Minutes left at which a warning is sent, from what an admin typed: "30, 10, 5 1". Whole numbers
 * from 1 to 600, at most 10, largest first. Null when something else was typed.
 */
export function parsePlaytimeMinutes(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  const numbers = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN));
  if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 600)) return null;
  const unique = [...new Set(numbers)].sort((a, b) => b - a);
  return unique.length <= 10 ? unique : null;
}

/** The inverse of `parsePlaytimeMinutes`, for an input: "30, 10, 5, 1". */
export function formatPlaytimeMinutes(minutes: readonly number[]): string {
  return minutes.join(', ');
}

/**
 * The cells of one calendar month, Monday first: a null for each blank before the 1st, then every
 * day as a "YYYY-MM-DD" Paris date. `month` counts from 0.
 */
export function playtimeMonthCells(year: number, month: number): (string | null)[] {
  const first = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length }, (_, i) => `${String(year)}-${pad(month + 1)}-${pad(i + 1)}`),
  ];
}
