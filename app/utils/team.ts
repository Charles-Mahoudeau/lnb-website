import type { TeamText } from '#shared/schemas/team';

/** A text of the team page in the active language. An empty French text falls back to English. */
export function teamText(text: TeamText, locale: string): string {
  return (locale.startsWith('fr') ? text.fr : text.en) || text.en;
}
