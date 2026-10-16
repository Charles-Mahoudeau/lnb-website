import { readAuthEnv } from './auth-env';

// The site's own public address, from BETTER_AUTH_URL, for links that leave the site: calendar
// files, social embeds and the BDE website. No Nuxt imports.

let origin: string | undefined;

/** An absolute URL on this site, such as https://lnb.bde-teknantes.fr/events/<id>. */
export function siteUrl(path: string): string {
  origin ??= new URL(readAuthEnv().BETTER_AUTH_URL).origin;
  return new URL(path, origin).toString();
}
