import { describe, expect, it } from 'vitest';
import type { RouteLocationNormalized } from 'vue-router';

import adminMiddleware from '~/middleware/admin';

function signIn(role: string | null) {
  useState('auth-session').value = { user: { id: 'u1', role } };
  useState('auth-session-loaded').value = true;
}

/** Whether the middleware lets the page open. Outside a navigation, refusing throws. */
function opens(meta: RouteLocationNormalized['meta']) {
  const to = { path: '/admin/x', meta } as RouteLocationNormalized;
  try {
    return adminMiddleware(to, to) === undefined;
  } catch {
    return false;
  }
}

describe('admin middleware', () => {
  it('lets site admins into every admin page', () => {
    signIn('admin');
    expect(opens({})).toBe(true);
    expect(opens({ wardenAdmins: true })).toBe(true);
  });

  it('lets Warden admins into Warden pages only', () => {
    signIn('warden-admin');
    expect(opens({ wardenAdmins: true })).toBe(true);
    expect(opens({})).toBe(false);
  });

  it('hides the admin area from everyone else', () => {
    signIn(null);
    expect(opens({ wardenAdmins: true })).toBe(false);
    expect(opens({})).toBe(false);
  });
});
