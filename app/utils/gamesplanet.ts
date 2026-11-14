// Prices and end dates of the Gamesplanet deals, from Intl in Europe/Paris (docs/gamesplanet.md).

/**
 * A link to a game (or to Gamesplanet's home page, with `site`) that goes through our click
 * counter. The counter redirects to Gamesplanet with the affiliate ref.
 */
export function gamesplanetGoUrl(
  uid: string,
  from: 'partners' | 'home' | 'event' | 'footer',
): string {
  return `/go/gp/${uid}?from=${from}`;
}

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
