import { randomBytes, randomUUID } from 'node:crypto';

import { eq, like } from 'drizzle-orm';
import { vi } from 'vitest';

import { db } from '~~/server/db';
import {
  audit,
  feedMember,
  feedPost,
  minecraftAccount,
  minecraftServerEvent,
  user,
  wardenPlayer,
} from '~~/server/db/schema';
import { feedPostService } from '~~/server/services/feed/posts';
import { feedViewService } from '~~/server/services/feed/views';
import { flagService } from '~~/server/services/flags';
import { minecraftEventService } from '~~/server/services/minecraft-events';
import { requireFeedServer, withRetryAfter } from '~~/server/utils/feed';
import { requireFlag } from '~~/server/utils/flags';
import { parseBody, parseParams, parseQuery } from '~~/server/utils/validation';
import { requireWardenServer } from '~~/server/utils/warden';

import { resolveFlags } from '#shared/flags';
import type { FlagKey } from '#shared/flags';

// Shared setup of the Feed tests against PostgreSQL: people with linked Minecraft accounts, the
// writing shortcuts, the stream, and a small harness that calls the route handlers the way Nitro
// does (a web Request in, the status, headers and Nitro's error body out).

export const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
export const SECRET = 'feed-http-test-secret-0123456789abcdef';
export const PREFIX = 'feedx-';
let counter = 0;

export interface Person {
  id: string;
  name: string;
  uuid: string;
  username: string;
  accounts: { uuid: string; username: string }[];
}

/** An LNB account with `accounts` linked Minecraft accounts (the first is the earliest linked). */
export async function person(
  name: string,
  options: { role?: string; showRealName?: boolean; accounts?: number; ghost?: boolean } = {},
): Promise<Person> {
  const n = ++counter;
  const id = `${PREFIX}${String(n)}-${randomBytes(3).toString('hex')}`;
  await db.insert(user).values({
    id,
    name,
    email: `${id}@epitech.eu`,
    tenantId: EPITECH,
    role: options.role ?? null,
    ghost: options.ghost ?? false,
  } as typeof user.$inferInsert);
  if (options.showRealName !== undefined) {
    await db.insert(wardenPlayer).values({ userId: id, showRealName: options.showRealName });
  }
  const accounts = Array.from({ length: options.accounts ?? 1 }, (_, i) => ({
    uuid: randomUUID(),
    username: `Fx${String(n)}${randomBytes(2).toString('hex')}${String(i)}`,
  }));
  for (const [i, account] of accounts.entries()) {
    await db.insert(minecraftAccount).values({
      ...account,
      userId: id,
      linkedAt: new Date(Date.now() - (accounts.length - i) * 1000),
    });
  }
  return {
    id,
    name,
    uuid: accounts[0]?.uuid ?? '',
    username: accounts[0]?.username ?? '',
    accounts,
  };
}

export const server = (player: { uuid: string }) => ({
  source: 'server' as const,
  player: player.uuid,
});
export const site = (who: { id: string }) => ({ source: 'site' as const, userId: who.id });

export function post(
  author: { uuid: string },
  text = 'Salut',
  options: { feed?: 'announcements' | 'global'; anonymous?: boolean; key?: string } = {},
) {
  return feedPostService.create({
    actor: server(author),
    idempotencyKey: options.key ?? randomUUID(),
    feed: options.feed ?? 'global',
    text,
    anonymous: options.anonymous ?? false,
  });
}

export function reply(
  author: { uuid: string },
  threadId: string,
  replyTo: string | null = null,
  options: { anonymous?: boolean; text?: string; key?: string } = {},
) {
  return feedPostService.reply({
    actor: server(author),
    idempotencyKey: options.key ?? randomUUID(),
    threadId,
    replyTo,
    text: options.text ?? 'Moi !',
    anonymous: options.anonymous ?? false,
  });
}

export async function viewOf(viewer: { uuid: string }, id: string) {
  const { views } = await feedViewService.views({ viewers: [viewer.uuid], ids: [id] });
  return views[0]!.posts[0];
}

/** The status and `data` of a refusal, or null when the call succeeded. */
export async function problemOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const data = (error as { data?: Record<string, unknown> }).data;
    return { status: (error as { statusCode?: number }).statusCode, ...data } as {
      status?: number;
      problem?: string;
      [key: string]: unknown;
    };
  }
  return null;
}

export async function eventsSince(from: number) {
  return (await minecraftEventService.since('feed', from)).map((row) => ({
    type: row.type,
    data: row.data,
  }));
}

export async function latestEvent() {
  return minecraftEventService.latestId('feed');
}

export async function wipe() {
  await db.delete(feedPost);
  await db.delete(feedMember);
  await db.delete(audit).where(like(audit.action, 'minecraft.feed.%'));
  await db.delete(user).where(like(user.id, `${PREFIX}%`));
  await db.delete(minecraftServerEvent).where(eq(minecraftServerEvent.topic, 'feed'));
}

/**
 * Switches flags for the test, with the real parent rule: every flag is on unless named here (the
 * test database has `feed` seeded off, as the migration ships it).
 */
export function setFlags(off: Partial<Record<FlagKey, boolean>> = {}) {
  const overrides = new Map<string, boolean>(Object.entries(off));
  return vi
    .spyOn(flagService, 'isEnabled')
    .mockImplementation((key: FlagKey) => Promise.resolve(resolveFlags(overrides)[key]));
}

// --- Calling the handlers -----------------------------------------------------------------------

/** The auto-imports the handlers use, as Nitro provides them. */
export function stubServerUtils() {
  process.env.WARDEN_SERVER_SECRET ??= SECRET;
  process.env.BETTER_AUTH_URL ??= 'https://lnb.example.com';
  vi.stubGlobal('requireFeedServer', requireFeedServer);
  vi.stubGlobal('requireWardenServer', requireWardenServer);
  vi.stubGlobal('requireFlag', requireFlag);
  vi.stubGlobal('withRetryAfter', withRetryAfter);
  vi.stubGlobal('parseBody', parseBody);
  vi.stubGlobal('parseParams', parseParams);
  vi.stubGlobal('parseQuery', parseQuery);
}

export function secret(): string {
  return process.env.WARDEN_SERVER_SECRET!;
}

export interface HttpAnswer {
  status: number;
  headers: Headers;
  body: unknown;
  /** Nitro's error body, when the handler threw. */
  error?: { statusCode: number; statusMessage?: string; data?: Record<string, unknown> };
}

// The handlers are typed against nuxt/server's RequestEvent; the harness passes its own.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: any) => unknown;

/**
 * Calls a route handler as Nitro would: a web Request with the secret (unless `auth` says
 * otherwise), the route's params, and the answer's status and headers. A thrown error becomes its
 * status and Nitro's `{ statusCode, statusMessage, data }`.
 */
export async function call(
  handler: Handler,
  request: {
    method: string;
    url: string;
    params?: Record<string, string>;
    body?: unknown;
    auth?: string | null;
    headers?: Record<string, string>;
  },
): Promise<HttpAnswer> {
  const headers = new Headers({ accept: 'application/json', ...request.headers });
  const auth = request.auth === undefined ? `Bearer ${secret()}` : request.auth;
  if (auth !== null) headers.set('authorization', auth);
  let body: string | undefined;
  if (request.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  }
  const req = new Request(`http://localhost${request.url}`, {
    method: request.method,
    headers,
    body,
  });
  const event = {
    req,
    url: new URL(req.url),
    res: { status: 200, statusText: undefined as string | undefined, headers: new Headers() },
    context: { params: request.params ?? {} },
  };
  try {
    const value = await handler(event);
    return { status: event.res.status, headers: event.res.headers, body: value };
  } catch (thrown) {
    const error = thrown as {
      statusCode?: number;
      statusMessage?: string;
      data?: Record<string, unknown>;
    };
    if (typeof error.statusCode !== 'number') throw thrown;
    return {
      status: error.statusCode,
      headers: event.res.headers,
      body: undefined,
      error: { statusCode: error.statusCode, statusMessage: error.statusMessage, data: error.data },
    };
  }
}
