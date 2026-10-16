export interface LinkApp {
  name: string;
  /** Tenant IDs of the schools whose students can link this app. Every school when left out. */
  schools?: readonly string[];
  /**
   * Where /link may send people back after linking, with the access token. Loopback URLs
   * (127.0.0.1, [::1], localhost) match on any port, for apps listening on the person's own device.
   */
  redirectUris?: readonly string[];
  /**
   * Where /link always sends people once linked, with the access token, when the app's link has
   * no redirect_uri (for example when the code was typed on /link). A path on this site or a URL.
   */
  redirectAfterLink?: string;
  /**
   * The app's own server creates its codes and handles what linking means, so Better Auth's
   * /device/code and /device/token refuse it and linking gives no token. Warden works this way.
   */
  issuedByServer?: boolean;
}

// Apps that can link to an LNB account with a 6-digit code on /link (Better Auth's device
// authorization). An app sends its ID as `client_id`, and codes from any other ID are refused.
// The app's description is under `link.apps.<id>` in the locale files.
export const LINK_APPS: Readonly<Record<string, LinkApp>> = {
  // Minecraft accounts, linked from codes the Minecraft server creates. See docs/warden.md.
  warden: {
    name: 'Warden',
    schools: ['901cb4ca-b862-4029-9306-e5cd0f6d9f86'], // Epitech
    redirectAfterLink: '/minecraft/warden',
    issuedByServer: true,
  },
};

export function isLinkApp(clientId: string | undefined | null): clientId is string {
  return typeof clientId === 'string' && Object.hasOwn(LINK_APPS, clientId);
}

export function getLinkApp(clientId: string | undefined | null): LinkApp | undefined {
  return isLinkApp(clientId) ? LINK_APPS[clientId] : undefined;
}

export function canLinkFromSchool(app: LinkApp, tenantId: string): boolean {
  return !app.schools || app.schools.includes(tenantId.toLowerCase());
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);

/** Whether `uri` is one of the app's redirect URIs. Fragments are refused, since the token goes in the query. */
export function isAllowedRedirect(app: LinkApp, uri: string): boolean {
  if (!URL.canParse(uri)) return false;
  const url = new URL(uri);
  if (url.hash || url.username || url.password) return false;
  return (app.redirectUris ?? []).some((allowed) => {
    const expected = new URL(allowed);
    if (LOOPBACK_HOSTS.has(expected.hostname)) {
      return (
        url.protocol === expected.protocol &&
        url.hostname === expected.hostname &&
        url.pathname === expected.pathname
      );
    }
    return url.origin === expected.origin && url.pathname === expected.pathname;
  });
}

/** Link codes are 6 digits. People may type or paste them with a space or a dash. */
export const LINK_CODE_LENGTH = 6;

export function normalizeLinkCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, LINK_CODE_LENGTH);
}
