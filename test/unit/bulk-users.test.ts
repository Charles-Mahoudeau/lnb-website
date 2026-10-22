import { describe, expect, it } from 'vitest';

import { adminBulkBody } from '../../shared/schemas/admin.ts';
import { bulkProblem } from '../../shared/utils/bulk-users.ts';

const now = new Date('2026-10-22T12:00:00Z');
const target = (over: Partial<Parameters<typeof bulkProblem>[2]> = {}) => ({
  id: 'u1',
  role: null,
  banned: false,
  banExpires: null,
  ...over,
});
const run = (action: 'signOut' | 'ban' | 'unban' | 'delete', t = target()) =>
  bulkProblem({ action }, 'me', t, now);

describe('bulk rules', () => {
  it('signs out anyone', () => {
    expect(run('signOut', target({ id: 'me', role: 'admin' }))).toBeNull();
  });

  it('never bans or deletes the caller or an admin', () => {
    expect(run('ban', target({ id: 'me' }))).toBe('self');
    expect(run('delete', target({ id: 'me' }))).toBe('self');
    expect(run('ban', target({ role: 'admin,events-manager' }))).toBe('targetIsAdmin');
    expect(run('delete', target({ role: 'admin' }))).toBe('targetIsAdmin');
    expect(run('ban')).toBeNull();
    expect(run('delete')).toBeNull();
  });

  it('bans only accounts without a ban in force', () => {
    expect(run('ban', target({ banned: true }))).toBe('alreadyBanned');
    expect(run('ban', target({ banned: true, banExpires: new Date('2026-10-01') }))).toBeNull();
  });

  it('unbans only accounts with a ban in force', () => {
    expect(run('unban')).toBe('notBanned');
    expect(run('unban', target({ banned: true, banExpires: new Date('2026-10-01') }))).toBe(
      'notBanned',
    );
    expect(run('unban', target({ banned: true }))).toBeNull();
    expect(run('unban', target({ banned: true, banExpires: new Date('2026-11-01') }))).toBeNull();
  });

  it('adds or removes a role only where it changes something', () => {
    const add = { action: 'roles', roles: { role: 'events-manager', mode: 'add' } } as const;
    const remove = { action: 'roles', roles: { role: 'warden-admin', mode: 'remove' } } as const;
    expect(bulkProblem(add, 'me', target(), now)).toBeNull();
    expect(bulkProblem(add, 'me', target({ role: 'events-manager' }), now)).toBe('unchanged');
    expect(bulkProblem(remove, 'me', target(), now)).toBe('unchanged');
    expect(bulkProblem(remove, 'me', target({ role: 'warden-admin' }), now)).toBeNull();
  });
});

describe('bulk body', () => {
  const ids = { userIds: ['a', 'b'] };
  it('needs a ban to ban, unless it is a dry run', () => {
    expect(adminBulkBody.safeParse({ action: 'ban', selection: ids }).success).toBe(false);
    expect(adminBulkBody.safeParse({ action: 'ban', selection: ids, dryRun: true }).success).toBe(
      true,
    );
    expect(
      adminBulkBody.safeParse({
        action: 'ban',
        selection: ids,
        ban: { reason: 'Spam', durationSeconds: null },
      }).success,
    ).toBe(true);
  });

  it('needs a role change for roles, and never the admin role', () => {
    expect(adminBulkBody.safeParse({ action: 'roles', selection: ids }).success).toBe(false);
    expect(
      adminBulkBody.safeParse({
        action: 'roles',
        selection: ids,
        roles: { role: 'admin', mode: 'add' },
      }).success,
    ).toBe(false);
  });

  it('takes IDs or filters, and caps the IDs', () => {
    expect(
      adminBulkBody.safeParse({ action: 'signOut', selection: { filters: { status: 'banned' } } })
        .success,
    ).toBe(true);
    expect(adminBulkBody.safeParse({ action: 'signOut', selection: { userIds: [] } }).success).toBe(
      false,
    );
    const many = Array.from({ length: 501 }, (_, i) => `u${String(i)}`);
    expect(
      adminBulkBody.safeParse({ action: 'signOut', selection: { userIds: many } }).success,
    ).toBe(false);
  });
});
