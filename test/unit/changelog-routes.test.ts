import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  changelogCreateBody,
  changelogPatchBody,
  changelogScheduleBody,
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

describe('changelog public routes', () => {
  it('check the flag before anything else', () => {
    const found = files(join(import.meta.dirname, '../../server/api/changelog'));
    expect(found).toHaveLength(2);
    for (const path of found) {
      expect(readFileSync(path, 'utf8'), path).toMatch(
        /defineEventHandler\(async \(event\) => \{\n\s+await requireFlag\(event, 'changelog'\);/,
      );
    }
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
