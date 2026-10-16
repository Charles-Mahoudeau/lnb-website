// Avatars without a photo get a soft tint per person (docs/design.md). The classes are written
// out in full so Tailwind finds them.
const TINTS = [
  { root: 'bg-avatar-1/20', fallback: 'text-avatar-1' },
  { root: 'bg-avatar-2/20', fallback: 'text-avatar-2' },
  { root: 'bg-avatar-3/20', fallback: 'text-avatar-3' },
  { root: 'bg-avatar-4/20', fallback: 'text-avatar-4' },
  { root: 'bg-avatar-5/20', fallback: 'text-avatar-5' },
] as const;

/** The `ui` prop for a UAvatar: the same tint for the same ID, everywhere. */
export function avatarTint(id: string): (typeof TINTS)[number] {
  // FNV-1a, so similar IDs still spread over the tints.
  let hash = 0x811c9dc5;
  for (const char of id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return TINTS[(hash >>> 0) % TINTS.length]!;
}
