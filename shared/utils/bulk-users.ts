import { hasRole, isAdmin } from './roles.ts';
import type { AdminBulkBody, AdminProblem } from '../schemas/admin.ts';

// The rules of a bulk action on accounts (POST /api/admin/users/bulk): who it applies to and who
// it leaves alone. The service uses them to apply it, and to count in a dry run.

export interface BulkTarget {
  id: string;
  role: string | null;
  banned: boolean | null;
  banExpires: Date | null;
}

/** Why a bulk action leaves this account alone, or null when it applies. */
export function bulkProblem(
  body: Pick<AdminBulkBody, 'action' | 'roles'>,
  actorId: string,
  target: BulkTarget,
  now: Date,
): AdminProblem | null {
  const banned = target.banned === true && (!target.banExpires || target.banExpires > now);
  switch (body.action) {
    case 'signOut':
      return null;
    case 'ban':
      if (target.id === actorId) return 'self';
      if (isAdmin(target.role)) return 'targetIsAdmin';
      return banned ? 'alreadyBanned' : null;
    case 'unban':
      return banned ? null : 'notBanned';
    case 'delete':
      if (target.id === actorId) return 'self';
      return isAdmin(target.role) ? 'targetIsAdmin' : null;
    case 'roles': {
      // The role names in the body are the stored ones.
      return hasRole(target.role, body.roles?.role ?? '') === (body.roles?.mode === 'add')
        ? 'unchanged'
        : null;
    }
  }
}
