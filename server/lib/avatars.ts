// No Nuxt imports here: auth.ts uses this, and the Better Auth CLI loads auth.ts. The Nitro
// plugin server/plugins/avatars.ts plugs the avatars service in at startup.

/** Stores a JPEG photo and returns the URL to show it from. */
export type AvatarStore = (bytes: Buffer) => Promise<string>;

let store: AvatarStore | undefined;

export function setAvatarStore(next: AvatarStore): void {
  store = next;
}

const MAX_BYTES = 256 * 1024;

/** The bytes of a base64 data URL, as Better Auth's Microsoft provider builds it, or undefined. */
export function decodePhotoDataUrl(url: string | undefined): Buffer | undefined {
  const match = url?.match(/^data:image\/jpeg;base64,\s*([A-Za-z0-9+/=]+)$/);
  if (!match?.[1]) return undefined;
  const bytes = Buffer.from(match[1], 'base64');
  return bytes.length > 0 && bytes.length <= MAX_BYTES ? bytes : undefined;
}

/**
 * Turns the photo from the Microsoft profile into a URL on this site, or undefined when there is
 * no photo or it can't be stored, which leaves user.image as it is. A failure never blocks the
 * sign-in.
 */
export async function saveProfilePhoto(dataUrl: string | undefined): Promise<string | undefined> {
  const bytes = decodePhotoDataUrl(dataUrl);
  if (!bytes || !store) return undefined;
  try {
    return await store(bytes);
  } catch {
    return undefined;
  }
}
