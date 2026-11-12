import type {
  AnticheatFileBand,
  AnticheatFileKind,
  AnticheatStatus,
} from '../schemas/anticheat.ts';

// Helpers for the anticheat that the server and the admin pages both use. See docs/anticheat.md.

export interface AnticheatStatusInput {
  kind: AnticheatFileKind;
  score: number | null;
  band: AnticheatFileBand | null;
  /** The band the file had when an admin marked it reviewed. */
  reviewedBand: AnticheatFileBand | null;
}

/**
 * The admin label of a file. Derived, never stored: `pending` while it has no score yet, `banned` at 0,
 * `approved` at 100, `refused` in the low band, `review` in the middle band or in the accepted band
 * until an admin reviews it. Only mods and resource packs get `refused` and `review`.
 */
export function fileStatus(file: AnticheatStatusInput): AnticheatStatus | null {
  if (file.kind === 'client') return null;
  // An override scores a file before its lookup ends, so a band wins over a pending lookup.
  if (file.band === null) return 'pending';
  if (file.band === 'banned') return 'banned';
  if (file.band === 'approved') return 'approved';
  if (file.kind === 'shader') return 'accepted';
  if (file.band === 'low') return 'refused';
  if (file.band === 'middle') return 'review';
  return file.reviewedBand === file.band ? 'accepted' : 'review';
}
