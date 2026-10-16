import { describe, expect, it } from 'vitest';

import {
  canOpenAdmin,
  hasRole,
  isAdmin,
  isEventsManager,
  isWardenAdmin,
  parseRoles,
  withRole,
} from '../../shared/utils/roles.ts';

describe('roles', () => {
  it('parses comma-separated roles', () => {
    expect(parseRoles('admin, warden-admin')).toEqual(['admin', 'warden-admin']);
    expect(parseRoles(null)).toEqual([]);
    expect(hasRole('user,warden-admin', 'warden-admin')).toBe(true);
  });

  it('makes site admins Warden admins', () => {
    expect(isWardenAdmin('admin')).toBe(true);
    expect(isWardenAdmin('warden-admin')).toBe(true);
    expect(isWardenAdmin('user')).toBe(false);
    expect(isAdmin('warden-admin')).toBe(false);
  });

  it('makes site admins events managers, and keeps the role apart from Warden', () => {
    expect(isEventsManager('admin')).toBe(true);
    expect(isEventsManager('events-manager')).toBe(true);
    expect(isEventsManager('warden-admin')).toBe(false);
    expect(isWardenAdmin('events-manager')).toBe(false);
    expect(canOpenAdmin('events-manager')).toBe(true);
    expect(canOpenAdmin('warden-admin')).toBe(true);
    expect(canOpenAdmin(null)).toBe(false);
  });

  it('adds and removes a role', () => {
    expect(withRole('admin', 'warden-admin', true)).toBe('admin,warden-admin');
    expect(withRole('user', 'warden-admin', true)).toBe('warden-admin');
    expect(withRole('warden-admin', 'warden-admin', false)).toBeNull();
    expect(withRole('admin,warden-admin', 'warden-admin', false)).toBe('admin');
  });
});
