import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  fingerprint,
  decodeCursor,
  encodeCursor,
  rightsOf,
} from '../../server/services/feed/rules.ts';
import {
  feedServerPostBody,
  feedServerSeenBody,
  feedViewsBody,
} from '../../shared/schemas/feed.ts';

// The Minecraft server's Feed routes (docs/feed-mod.md): the secret and the flags come first, in
// the contract's order, and writing needs `feed.writing` while deleting and pinning don't.

const DIR = join(import.meta.dirname, '../../server/api/feed/server');
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
const name = (path: string) => relative(DIR, path).replaceAll('\\', '/');
const player = '3f0b2c1a-8d4e-3b7f-9a12-6c5d4e3f2a10';

const WRITES = [
  'posts/index.post.ts',
  'posts/[id]/replies.post.ts',
  'posts/[id]/like.put.ts',
  'posts/[id]/like.delete.ts',
];

describe('Feed server routes', () => {
  it('check the secret and the feed flags before anything else', () => {
    const found = files(DIR);
    expect(found).toHaveLength(18);
    for (const path of found) {
      expect(readFileSync(path, 'utf8'), name(path)).toMatch(
        /defineEventHandler\(async \(event\) => \{\n\s+await requireFeedServer\(event\);/,
      );
    }
  });

  it('put posting, replying and liking behind feed.writing, and nothing else', () => {
    for (const path of files(DIR)) {
      const source = readFileSync(path, 'utf8');
      const gated =
        /await requireFeedServer\(event\);\n\s+await requireFlag\(event, 'feed\.writing'\);/.test(
          source,
        );
      expect(gated, name(path)).toBe(WRITES.includes(name(path)));
    }
  });
});

describe('Feed schemas', () => {
  it('caps the raw text at 4,000 characters and wants a key', () => {
    const body = { idempotencyKey: crypto.randomUUID(), player, feed: 'global', anonymous: false };
    expect(feedServerPostBody.safeParse({ ...body, text: 'a'.repeat(4000) }).success).toBe(true);
    expect(feedServerPostBody.safeParse({ ...body, text: 'a'.repeat(4001) }).success).toBe(false);
    expect(feedServerPostBody.safeParse({ ...body, text: 'x', idempotencyKey: 'k' }).success).toBe(
      false,
    );
  });

  it('takes 1 to 200 distinct viewers and 1 to 20 distinct IDs', () => {
    const id = crypto.randomUUID();
    expect(feedViewsBody.safeParse({ viewers: [player], ids: [id] }).success).toBe(true);
    expect(feedViewsBody.safeParse({ viewers: [player, player], ids: [id] }).success).toBe(false);
    expect(feedViewsBody.safeParse({ viewers: [player], ids: [] }).success).toBe(false);
    expect(
      feedViewsBody.safeParse({
        viewers: [player],
        ids: Array.from({ length: 21 }, () => crypto.randomUUID()),
      }).success,
    ).toBe(false);
  });

  it('wants an ISO date to mark a feed seen', () => {
    expect(
      feedServerSeenBody.safeParse({ player, feed: 'global', upTo: '2026-11-23T20:14:05.000Z' })
        .success,
    ).toBe(true);
    expect(feedServerSeenBody.safeParse({ player, feed: 'global', upTo: 'now' }).success).toBe(
      false,
    );
  });
});

describe('Feed rules', () => {
  it('gives rights from the link, the ban and the role', () => {
    expect(rightsOf({ linked: true, banned: false, role: null })).toEqual({
      write: true,
      announce: false,
      moderate: false,
    });
    expect(rightsOf({ linked: true, banned: false, role: 'feed-announcer' })).toMatchObject({
      announce: true,
    });
    // A moderator without a linked account moderates but doesn't write.
    expect(rightsOf({ linked: false, banned: false, role: 'warden-admin' })).toEqual({
      write: false,
      announce: false,
      moderate: true,
    });
    expect(rightsOf({ linked: true, banned: true, role: 'admin' })).toEqual({
      write: false,
      announce: false,
      moderate: false,
    });
  });

  it('fingerprints the cleaned text, the requester and the target', () => {
    const camille = { source: 'server' as const, player };
    const global = { kind: 'post' as const, feed: 'global' as const };
    const base = fingerprint(camille, global, 'Salut', false);
    expect(fingerprint(camille, global, '  Salut  ', false)).toBe(base);
    expect(fingerprint(camille, global, 'Salut !', false)).not.toBe(base);
    expect(fingerprint(camille, global, 'Salut', true)).not.toBe(base);
    expect(fingerprint(camille, { kind: 'post', feed: 'announcements' }, 'Salut', false)).not.toBe(
      base,
    );
    expect(fingerprint({ source: 'site', userId: 'u' }, global, 'Salut', false)).not.toBe(base);
  });

  it('round-trips cursors under 128 characters and refuses others', () => {
    const at = new Date('2026-11-23T20:14:05.123Z');
    const id = '0d1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e70';
    const cursor = encodeCursor(at, id);
    expect(cursor.length).toBeLessThanOrEqual(128);
    expect(decodeCursor(cursor)).toEqual({ at, id });
    expect(decodeCursor('nope')).toBeNull();
    expect(decodeCursor(Buffer.from('[1,"x"]').toString('base64url'))).toBeNull();
  });
});
