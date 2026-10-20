import { SCHOOLS } from '#shared/utils/schools';

/** The names of the schools behind some tenant IDs, in the order given. */
export function schoolNames(tenantIds: readonly string[]): string[] {
  return tenantIds.map((tid) => SCHOOLS[tid]).filter((name): name is string => !!name);
}

/** The full short URL, from the site's origin. */
export function shortUrl(baseUrl: string, shortId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/r/${shortId}`;
}
