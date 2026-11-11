// Team rules both the app and the server use. See docs/tournaments.md.

export const TEAM_NAME_MIN = 3;
export const TEAM_NAME_MAX = 30;
/** The smallest team a tournament can ask for, and the largest. */
export const TEAM_SIZE_MIN = 2;
export const TEAM_SIZE_MAX = 32;
/** A player can have this many requests to join waiting at once. */
export const MAX_PENDING_REQUESTS = 3;
/** A player can have this many invitations waiting per event. */
export const MAX_PENDING_INVITES = 10;

/** Characters as people count them, so an accented letter or an emoji counts once. */
function graphemes(text: string): number {
  return [...new Intl.Segmenter().segment(text)].length;
}

/** A team name with its spaces tidied: trimmed, and runs of whitespace made single spaces. */
export function cleanTeamName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Whether a name has a valid length, once tidied. Plain text only: no control characters. */
export function isValidTeamName(name: string): boolean {
  const clean = cleanTeamName(name);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(clean)) return false;
  const length = graphemes(clean);
  return length >= TEAM_NAME_MIN && length <= TEAM_NAME_MAX;
}

/**
 * What makes two names the same within an event: tidied, without accents, in lower case. "Les
 * Éclairs" and "les eclairs" can't both exist.
 */
export function teamNameKey(name: string): string {
  return cleanTeamName(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Whether a team's size fits an event's: under the minimum, enough, or over the maximum. */
export type TeamSize = 'incomplete' | 'valid' | 'over';

export function teamSize(count: number, min: number, max: number): TeamSize {
  if (count < min) return 'incomplete';
  return count > max ? 'over' : 'valid';
}

/** The sizes an event may ask of its teams, or the reason it can't. */
export function teamSizeProblem(min: number, max: number): 'min' | 'max' | null {
  if (!Number.isInteger(min) || min < TEAM_SIZE_MIN) return 'min';
  if (!Number.isInteger(max) || max < min || max > TEAM_SIZE_MAX) return 'max';
  return null;
}
