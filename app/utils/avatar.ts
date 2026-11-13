// Avatars without a photo show the LNB wolf on a soft tint per person (docs/design.md). The classes
// are written out in full so Tailwind finds them.
const TINTS = [
  { root: 'bg-avatar-1', wolf: 'text-avatar-ink-1' },
  { root: 'bg-avatar-2', wolf: 'text-avatar-ink-2' },
  { root: 'bg-avatar-3', wolf: 'text-avatar-ink-3' },
  { root: 'bg-avatar-4', wolf: 'text-avatar-ink-4' },
  { root: 'bg-avatar-5', wolf: 'text-avatar-ink-5' },
  { root: 'bg-avatar-6', wolf: 'text-avatar-ink-6' },
  { root: 'bg-avatar-7', wolf: 'text-avatar-ink-7' },
  { root: 'bg-avatar-8', wolf: 'text-avatar-ink-8' },
] as const;

/**
 * The tint classes for a person: `root` for the avatar's background and `wolf` for the wolf. The
 * same ID gets the same tint everywhere. Hash the account ID, not the email: it stays the same when
 * a ghost account is claimed, and it is already public on the team page.
 */
export function avatarTint(id: string): (typeof TINTS)[number] {
  // FNV-1a, so similar IDs still spread over the tints.
  let hash = 0x811c9dc5;
  for (const char of id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return TINTS[(hash >>> 0) % TINTS.length]!;
}
