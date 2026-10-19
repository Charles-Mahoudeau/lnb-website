import type { PartnerText } from '#shared/schemas/partners';

/** A text of the partners page in the active language. An empty French text falls back to English. */
export function partnerText(text: PartnerText, locale: string): string {
  return (locale.startsWith('fr') ? text.fr : text.en) || text.en;
}

/** The host of a partner's link, shown as its text: `northpeak.example`. */
export function partnerHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}
