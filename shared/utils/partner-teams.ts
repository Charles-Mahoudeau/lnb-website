// Team rules for partner events with no database, shared by the server and the app. See
// docs/partner-events.md.

/** An abbreviation as stored: trimmed and in capitals. */
export function cleanAbbreviation(text: string): string {
  return text.trim().toUpperCase();
}

/** 2 to 5 letters or digits, no accents or spaces, once cleaned. */
export function isValidAbbreviation(text: string): boolean {
  return /^[A-Z0-9]{2,5}$/.test(cleanAbbreviation(text));
}

/** The role a joiner takes: starter while a starter place is free, then substitute, else none. */
export function roleForJoiner(
  game: { starters: number; substitutes: number },
  taken: { starters: number; substitutes: number },
): 'starter' | 'substitute' | null {
  if (taken.starters < game.starters) return 'starter';
  if (taken.substitutes < game.substitutes) return 'substitute';
  return null;
}

/** Places left for invitations: those free, minus the invitations already waiting. */
export function placesLeft(
  game: { starters: number; substitutes: number },
  taken: { starters: number; substitutes: number },
  pending: number,
): number {
  const free = game.starters + game.substitutes - taken.starters - taken.substitutes;
  return Math.max(0, free - pending);
}
