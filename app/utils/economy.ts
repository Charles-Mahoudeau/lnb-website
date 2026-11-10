import type { EconomyCounterparty } from '#shared/schemas/economy';

// Amounts and dates for the economy pages (docs/economy.md), from Intl in Europe/Paris.

const TIME_ZONE = 'Europe/Paris';

/** "12,450" in English, "12 450" in French. LNBits have no decimals. */
export function formatLnbits(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount);
}

/** "+1,000" or "−250", with a real minus sign. */
export function formatSignedLnbits(amount: number, locale: string): string {
  return `${amount < 0 ? '−' : '+'}${formatLnbits(Math.abs(amount), locale)}`;
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
