import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  changelogCreateBody,
  changelogPatchBody,
  changelogScheduleBody,
  changelogSeenBody,
  changelogServerUnseenQuery,
} from '../../shared/schemas/changelog.ts';

const DIR = join(import.meta.dirname, '../../server/api/admin/changelog');
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );

describe('changelog admin routes', () => {
  it('are for Warden admins, and admins through them', () => {
    const found = files(DIR);
    expect(found.length).toBeGreaterThanOrEqual(10);
    for (const path of found) {
      expect(readFileSync(path, 'utf8'), path).toMatch(
        /defineEventHandler\(async \(event\) => \{\n\s+(const admin = )?await requireWardenAdmin\(event\);/,
      );
    }
  });
});

describe('changelog image upload', () => {
  it('is for Warden admins, not only events managers', () => {
    const source = readFileSync(join(DIR, 'images.post.ts'), 'utf8');
    expect(source).toMatch(
      /defineEventHandler\(async \(event\) => \{\n\s+await requireWardenAdmin\(event\);/,
    );
    expect(source).not.toContain('requireEventsManager');
  });
});

describe('changelog public routes', () => {
  it('check the flag before anything else', () => {
    const found = files(join(import.meta.dirname, '../../server/api/changelog/posts'));
    expect(found).toHaveLength(2);
    for (const path of found) {
      expect(readFileSync(path, 'utf8'), path).toMatch(
        /defineEventHandler\(async \(event\) => \{\n\s+await requireFlag\(event, 'changelog'\);/,
      );
    }
  });
});

describe('changelog server routes', () => {
  it('check the server secret, then the flag, before anything else', () => {
    const found = files(join(import.meta.dirname, '../../server/api/changelog/server'));
    expect(found).toHaveLength(4);
    for (const path of found) {
      expect(readFileSync(path, 'utf8'), path).toMatch(
        /defineEventHandler\(async \(event\) => \{\n\s+requireWardenServer\(event\);\n\s+await requireFlag\(event, 'changelog'\);/,
      );
    }
  });

  it('wants a UUID for the player', () => {
    const player = '5c2a7a3e-0000-4000-8000-00000000c10a';
    expect(changelogServerUnseenQuery.safeParse({ player, lang: 'fr' }).success).toBe(true);
    expect(changelogServerUnseenQuery.safeParse({ player: 'Steve' }).success).toBe(false);
    expect(changelogSeenBody.safeParse({ player }).success).toBe(true);
    expect(changelogSeenBody.safeParse({}).success).toBe(false);
  });
});

describe('changelog schemas', () => {
  it('needs a title and a body to create', () => {
    const ok = { sourceLang: 'en', source: { title: 'T', body: 'B' } };
    expect(changelogCreateBody.safeParse(ok).success).toBe(true);
    expect(
      changelogCreateBody.safeParse({ ...ok, source: { title: ' ', body: 'B' } }).success,
    ).toBe(false);
    expect(changelogCreateBody.safeParse({ ...ok, sourceLang: 'de' }).success).toBe(false);
  });

  it('takes a partial source and a whole translation', () => {
    expect(changelogPatchBody.safeParse({ source: { title: 'New' } }).success).toBe(true);
    expect(changelogPatchBody.safeParse({ translation: { title: 'New' } }).success).toBe(false);
  });

  it('wants an ISO date to schedule', () => {
    expect(changelogScheduleBody.safeParse({ at: '2027-01-01T10:00:00.000Z' }).success).toBe(true);
    expect(changelogScheduleBody.safeParse({ at: 'tomorrow' }).success).toBe(false);
  });
});
