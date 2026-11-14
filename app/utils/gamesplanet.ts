// Prices and end dates of the Gamesplanet deals, from Intl in Europe/Paris (docs/gamesplanet.md).

const TIME_ZONE = 'Europe/Paris';

/** "9,99 €" in French, "€9.99" in English. Gamesplanet's feed is in euros for everyone. */
export function formatEuros(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** "18 Nov" or "18 nov.": the day a flash price ends, in Paris time. */
export function formatDealEnd(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}
