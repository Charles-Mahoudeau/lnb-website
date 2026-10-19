const AVATAR_PREFIX = '/api/avatars/';
const PHOTO_PREFIX = '/api/team/photos/';

/**
 * An account's photo as the public team page serves it. Stored photos get a route that needs no
 * sign-in (and only answers for visible team members); any other value gives no photo.
 */
export function publicTeamPhoto(image: string | null): string | null {
  return image?.startsWith(AVATAR_PREFIX) ? PHOTO_PREFIX + image.slice(AVATAR_PREFIX.length) : null;
}
