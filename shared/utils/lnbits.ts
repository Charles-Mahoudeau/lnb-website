// Money is counted in cents of LNBit (1 LNBit = 100 cents), as integers. Nothing here uses
// floating point on an amount: whole LNBits and cents come from integer division, so no amount
// ever drifts. See docs/economy.md.

export const CENTS_PER_LNBIT = 100;

/** The most a balance or a transaction holds, in whole LNBits. Far below 2^53 once in cents. */
export const MAX_LNBITS = 1_000_000_000_000;

/** Whole LNBits to cents. */
export function lnbitsToCents(lnbits: number): number {
  return lnbits * CENTS_PER_LNBIT;
}

/** Cents to whole LNBits, rounded down. */
export function centsToWholeLnbits(cents: number): number {
  return Math.floor(cents / CENTS_PER_LNBIT);
}

function decimalSeparator(locale: string): string {
  return (
    new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')
      ?.value ?? '.'
  );
}

/**
 * Cents as LNBits with two decimals, a trailing `.00` dropped: `0`, `0.05`, `1,200`, `1,234.56`
 * in English, `1 234,56` in French. Whole LNBits and cents are split with integer division.
 */
export function formatCents(cents: number, locale: string): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / CENTS_PER_LNBIT);
  const fraction = abs % CENTS_PER_LNBIT;
  const text = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(whole);
  const decimals = fraction === 0 ? '' : String(fraction).padStart(2, '0').replace(/0$/, '');
  const sign = negative && abs > 0 ? '−' : '';
  return `${sign}${text}${decimals ? decimalSeparator(locale) + decimals : ''}`;
}

/** The same, with `+` or `−` in front: a movement of money. */
export function formatSignedCents(cents: number, locale: string): string {
  return `${cents < 0 ? '−' : '+'}${formatCents(Math.abs(cents), locale)}`;
}

export type LnbitsParseError = 'format' | 'decimals' | 'min' | 'max';

export type LnbitsParseResult =
  { ok: true; cents: number } | { ok: false; error: LnbitsParseError };

/**
 * What a person typed as an amount of LNBits, as cents: whole or with up to two decimals, `.` or
 * `,` as the separator. More decimals, a sign or any other character is refused. Zero is refused
 * unless `allowZero`. Integer math only.
 */
export function parseLnbitsInput(
  input: string,
  options: { allowZero?: boolean; maxLnbits?: number } = {},
): LnbitsParseResult {
  const text = input.trim().replace(/\s/g, '');
  const match = /^(\d+)(?:[.,](\d*))?$/.exec(text);
  if (!match) return { ok: false, error: 'format' };
  const whole = match[1] ?? '0';
  const fraction = match[2] ?? '';
  if (fraction.length > 2) return { ok: false, error: 'decimals' };
  const max = options.maxLnbits ?? MAX_LNBITS;
  if (whole.length > 13 || Number(whole) > max) return { ok: false, error: 'max' };
  const cents = Number(whole) * CENTS_PER_LNBIT + Number(fraction.padEnd(2, '0'));
  if (cents === 0 && !options.allowZero) return { ok: false, error: 'min' };
  if (cents > max * CENTS_PER_LNBIT) return { ok: false, error: 'max' };
  return { ok: true, cents };
}

/** Cents as the text of an input: `12`, `0.5`, `12.34`, with a plain `.`. */
export function centsToInput(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / CENTS_PER_LNBIT);
  const fraction = abs % CENTS_PER_LNBIT;
  const decimals = fraction === 0 ? '' : `.${String(fraction).padStart(2, '0').replace(/0$/, '')}`;
  return `${cents < 0 ? '-' : ''}${String(whole)}${decimals}`;
}
