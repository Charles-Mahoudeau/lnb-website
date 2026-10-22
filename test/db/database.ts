// Where the database tests run. No Nuxt imports: vitest.config.ts loads this file.

const DEFAULT_URL = 'postgres://lnb:lnb@localhost:5432/lnb';

/** The development server's connection string (compose.yaml), or the one CI sets. */
export function serverUrl(): URL {
  return new URL(process.env.DATABASE_URL ?? DEFAULT_URL);
}

/** The same server, another database, so tests never touch the development data. */
export function testDatabaseUrl(name: string): string {
  const url = serverUrl();
  url.pathname = `/${name}`;
  return url.toString();
}

/** The server's maintenance database, to create and drop the test ones. */
export function adminDatabaseUrl(): string {
  const url = serverUrl();
  url.pathname = '/postgres';
  return url.toString();
}
