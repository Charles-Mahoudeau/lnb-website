import { createError } from 'nuxt/server';

import getAnnouncer from '~~/server/api/feed/admin/announcers/[userId].get';
import putAnnouncer from '~~/server/api/feed/admin/announcers/[userId].put';
import deleteRow from '~~/server/api/feed/admin/posts/[id]/delete.post';
import getRow from '~~/server/api/feed/admin/posts/[id].get';
import listRows from '~~/server/api/feed/admin/posts/index.get';

import { requireTestUser } from './feed-browser-helpers';
import type { As } from './feed-browser-helpers';
import { call } from './feed-helpers';
import type { HttpAnswer } from './feed-helpers';

import type { FeedAdminDetail, FeedAdminList } from '#shared/schemas/feed';
import { isWardenAdmin } from '#shared/utils/roles';

// The admin's Feed routes called as Nitro calls them, signed in as a test person: shared by the
// tests of the admin at the HTTP level (feed-admin-*.test.ts).

const BASE = '/api/feed/admin';
const SIGNED_IN = 'x-test-user';

/** `requireWardenAdmin` on the test session: 401 signed out, 403 without a moderator role. */
export async function requireTestWardenAdmin(event: { req: Request }) {
  const row = await requireTestUser(event);
  if (!isWardenAdmin(row.role)) throw createError({ status: 403, statusText: 'Forbidden' });
  return row;
}

function send(
  handler: Parameters<typeof call>[0],
  as: As,
  request: Omit<Parameters<typeof call>[1], 'auth' | 'headers'>,
) {
  return call(handler, { ...request, auth: null, headers: as ? { [SIGNED_IN]: as.id } : {} });
}

export const admin = {
  list: (as: As, query = '') =>
    send(listRows, as, { method: 'GET', url: `${BASE}/posts?${query}` }),
  row: (as: As, id: string) =>
    send(getRow, as, { method: 'GET', url: `${BASE}/posts/${id}`, params: { id } }),
  remove: (as: As, id: string, body?: unknown) =>
    send(deleteRow, as, {
      method: 'POST',
      url: `${BASE}/posts/${id}/delete`,
      params: { id },
      body,
    }),
  announcer: (as: As, userId: string) =>
    send(getAnnouncer, as, {
      method: 'GET',
      url: `${BASE}/announcers/${userId}`,
      params: { userId },
    }),
  setAnnouncer: (as: As, userId: string, body: unknown) =>
    send(putAnnouncer, as, {
      method: 'PUT',
      url: `${BASE}/announcers/${userId}`,
      params: { userId },
      body,
    }),
};

export const listOf = (answer: HttpAnswer) => answer.body as FeedAdminList;
export const detailOf = (answer: HttpAnswer) => answer.body as FeedAdminDetail;
export const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
