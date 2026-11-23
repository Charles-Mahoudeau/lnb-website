import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import getMe from '~~/server/api/feed/me.get';
import patchMe from '~~/server/api/feed/me.patch';
import unlike from '~~/server/api/feed/posts/[id]/like.delete';
import like from '~~/server/api/feed/posts/[id]/like.put';
import unpin from '~~/server/api/feed/posts/[id]/pin.delete';
import pin from '~~/server/api/feed/posts/[id]/pin.put';
import createReply from '~~/server/api/feed/posts/[id]/replies.post';
import threadSeen from '~~/server/api/feed/posts/[id]/seen.post';
import deletePost from '~~/server/api/feed/posts/[id].delete';
import getThread from '~~/server/api/feed/posts/[id].get';
import getPage from '~~/server/api/feed/posts/index.get';
import createPost from '~~/server/api/feed/posts/index.post';
import feedSeen from '~~/server/api/feed/seen.post';
import { db } from '~~/server/db';
import { minecraftAccount, user } from '~~/server/db/schema';

import { call } from './feed-helpers';
import type { HttpAnswer, Person } from './feed-helpers';

// The browser's Feed routes called as Nitro calls them, signed in as a test person: shared by the
// tests of the routes at the HTTP level (site-feed-http*.test.ts).

export const BASE = '/api/feed';
const SIGNED_IN = 'x-test-user';

/** The session's user, from the test header: the handlers' `requireUser`. */
export async function requireTestUser(event: { req: Request }) {
  const id = event.req.headers.get(SIGNED_IN);
  const [row] = id ? await db.select().from(user).where(eq(user.id, id)) : [];
  if (!row) throw createError({ status: 401, statusText: 'Unauthorized' });
  return row;
}

export type As = Person | { id: string } | null;

function send(
  handler: Parameters<typeof call>[0],
  as: As,
  request: Omit<Parameters<typeof call>[1], 'auth' | 'headers'>,
) {
  return call(handler, {
    ...request,
    auth: null,
    headers: as ? { [SIGNED_IN]: as.id } : {},
  });
}

export const api = {
  me: (as: As) => send(getMe, as, { method: 'GET', url: `${BASE}/me` }),
  patchMe: (as: As, body: unknown) =>
    send(patchMe, as, { method: 'PATCH', url: `${BASE}/me`, body }),
  page: (as: As, query: string) =>
    send(getPage, as, { method: 'GET', url: `${BASE}/posts?${query}` }),
  thread: (as: As, id: string, query = '') =>
    send(getThread, as, { method: 'GET', url: `${BASE}/posts/${id}?${query}`, params: { id } }),
  post: (as: As, body: unknown) =>
    send(createPost, as, { method: 'POST', url: `${BASE}/posts`, body }),
  reply: (as: As, id: string, body: unknown) =>
    send(createReply, as, {
      method: 'POST',
      url: `${BASE}/posts/${id}/replies`,
      params: { id },
      body,
    }),
  like: (as: As, id: string) =>
    send(like, as, { method: 'PUT', url: `${BASE}/posts/${id}/like`, params: { id } }),
  unlike: (as: As, id: string) =>
    send(unlike, as, { method: 'DELETE', url: `${BASE}/posts/${id}/like`, params: { id } }),
  pin: (as: As, id: string, body?: unknown) =>
    send(pin, as, { method: 'PUT', url: `${BASE}/posts/${id}/pin`, params: { id }, body }),
  unpin: (as: As, id: string) =>
    send(unpin, as, { method: 'DELETE', url: `${BASE}/posts/${id}/pin`, params: { id } }),
  remove: (as: As, id: string) =>
    send(deletePost, as, { method: 'DELETE', url: `${BASE}/posts/${id}`, params: { id } }),
  seen: (as: As, body: unknown) =>
    send(feedSeen, as, { method: 'POST', url: `${BASE}/seen`, body }),
  threadSeen: (as: As, id: string) =>
    send(threadSeen, as, { method: 'POST', url: `${BASE}/posts/${id}/seen`, params: { id } }),
};

export function postBody(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    feed: 'global',
    text: 'Depuis le site',
    anonymous: false,
    ...overrides,
  };
}

export function replyBody(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    replyTo: null,
    text: 'Moi !',
    anonymous: false,
    ...overrides,
  };
}

export function refusal(answer: HttpAnswer) {
  return { status: answer.status, data: answer.error?.data };
}

export function problem(status: number, code: string, extra: Record<string, unknown> = {}) {
  return { status, data: { problem: code, ...extra } };
}

/** A plain 400 or 404: Zod's refusal, with no problem code. */
export function plain(status: number) {
  return { status, data: undefined };
}

/** The post a creation answered. */
export function createdPost(answer: HttpAnswer) {
  return (answer.body as { post: Record<string, unknown> & { id: string } }).post;
}

/** Unlinks a Minecraft account, as Warden does. */
export async function unlink(account: { uuid: string }) {
  await db
    .update(minecraftAccount)
    .set({ unlinkedAt: new Date() })
    .where(eq(minecraftAccount.uuid, account.uuid));
}
