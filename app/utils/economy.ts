import type { EconomyCounterparty } from '#shared/schemas/economy';
import { CENTS_PER_LNBIT, formatCents, formatSignedCents } from '#shared/utils/lnbits';

// Amounts and dates for the economy pages (docs/economy.md), from Intl in Europe/Paris.

const TIME_ZONE = 'Europe/Paris';

/**
 * An amount in cents of LNBit, as LNBits: "12,450" in English, "12 450" in French, with two
 * decimals only when there are cents ("1,234.56", "0.05"). Every amount of money on a page goes
 * through this. Integer math, see shared/utils/lnbits.ts.
 */
export function formatLnbits(cents: number, locale: string): string {
  return formatCents(cents, locale);
}

/** "+1,000" or "−250", with a real minus sign. Cents in. */
export function formatSignedLnbits(cents: number, locale: string): string {
  return formatSignedCents(cents, locale);
}

/** A reward index or a median, in LNBits (not cents), rounded to a whole LNBit like the index. */
export function formatWholeLnbits(lnbits: number, locale: string): string {
  return formatCents(Math.round(lnbits) * CENTS_PER_LNBIT, locale);
}

/**
 * A short label for an axis or a histogram: cents as LNBits in compact notation ("1.2K"). Only for
 * labels that don't need to be exact, never for an amount a person reads.
 */
export function formatCompactLnbits(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    cents / CENTS_PER_LNBIT,
  );
}

/** A count (items, blocks mined, players): a plain integer, never an amount of money. */
export function formatCount(count: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(count);
}

/** The Paris day of a date, as YYYY-MM-DD, to group a history by day. */
export function economyDayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** "21:14". */
export function formatEconomyTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** "7 November", or "7 November 2025" in another year. */
export function formatEconomyDay(day: string, locale: string, now = new Date()): string {
  const date = new Date(`${day}T12:00:00Z`);
  const sameYear = day.slice(0, 4) === economyDayKey(now.toISOString()).slice(0, 4);
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

/** How the other side of a transaction is named, before translation of the special cases. */
export function counterpartyName(counterparty: EconomyCounterparty): string | null {
  switch (counterparty.type) {
    case 'player':
      return counterparty.name ?? counterparty.username;
    case 'account':
      return `#${counterparty.handle}`;
    default:
      return null;
  }
}
