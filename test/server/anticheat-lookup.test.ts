import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  anticheatFile,
  anticheatHistory,
  anticheatProject,
  wardenAudit,
} from '~~/server/db/schema';
import { anticheatLookupService } from '~~/server/services/anticheat/lookup';
import { CatalogUnavailableError } from '~~/server/services/anticheat/platforms';
import type { PlatformClient } from '~~/server/services/anticheat/platforms';
import { anticheatReportService } from '~~/server/services/anticheat/reports';
import { wardenAdminService } from '~~/server/services/warden/admin';
import { wardenEventService } from '~~/server/services/warden/events';

import { file, hash, session, setMode } from './anticheat-helpers';

// The mod catalog, which the platforms share, caches through Nitro.
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: (fn: unknown) => fn,
}));

const NOW = '2024-06-01T00:00:00Z';

function client(overrides: Partial<PlatformClient> = {}): PlatformClient {
  return {
    curseforgeConfigured: true,
    modrinthByHashes: vi.fn(() => Promise.resolve({ versions: new Map(), projects: new Map() })),
    curseforgeByFingerprints: vi.fn(() =>
      Promise.resolve({ files: new Map(), projects: new Map() }),
    ),
    ...overrides,
  };
}

/** A fake Modrinth that knows these hashes, all of one project. */
function modrinthKnows(hashes: string[], projectId = 'AABBCCDD', downloads = 2_000_000) {
  return vi.fn(() =>
    Promise.resolve({
      versions: new Map(
        hashes.map((sha512) => [
          sha512,
          {
            versionId: `v-${sha512.slice(0, 6)}`,
            projectId,
            versionNumber: '1.0.0',
            loaders: ['neoforge'],
            publishedAt: NOW,
          },
        ]),
      ),
      projects: new Map([
        [
          projectId,
          {
            id: projectId,
            slug: 'some-mod',
            title: 'Some Mod',
            projectType: 'mod',
            status: 'approved',
            downloads,
            publishedAt: '2022-01-01T00:00:00Z',
            serverSide: 'optional',
            fetchedAt: NOW,
          },
        ],
      ]),
    }),
  );
}

async function pending(values: Partial<typeof anticheatFile.$inferInsert> = {}) {
  const sha512 = hash();
  await db.insert(anticheatFile).values({
    sha512,
    kind: 'mod',
    filename: 'lookup.jar',
    lookupState: 'pending',
    ...values,
  });
  return sha512;
}

async function row(sha512: string) {
  const [found] = await db.select().from(anticheatFile).where(eq(anticheatFile.sha512, sha512));
  return found!;
}

async function resolveAll(platforms: PlatformClient) {
  return anticheatLookupService.resolve(await anticheatLookupService.claim(), platforms);
}

beforeEach(async () => {
  // Every pending file in the database would be claimed.
  await db.delete(anticheatFile);
  await db.delete(anticheatProject);
  await setMode('enforce');
  vi.spyOn(anticheatLookupService, 'kick').mockImplementation(() => {});
});

afterAll(async () => {
  await setMode('observe');
});

describe('anticheat lookups', () => {
  it('scores a found mod from its metadata and links it to a project', async () => {
    const a = await pending();
    const b = await pending();
    await resolveAll(client({ modrinthByHashes: modrinthKnows([a, b]) }));

    const first = await row(a);
    expect(first.lookupState).toBe('found');
    expect(first.projectId).not.toBeNull();
    expect(first.score).toBeGreaterThan(1);
    expect(first.platformVersion?.modrinth?.versionNumber).toBe('1.0.0');
    // Two versions of one project share it.
    expect((await row(b)).projectId).toBe(first.projectId);
    const projects = await db.select().from(anticheatProject);
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ modrinthId: 'AABBCCDD', name: 'Some Mod' });
  });

  it('merges the projects of a hash found on both platforms and keeps a ban', async () => {
    const [modrinthProject] = await db
      .insert(anticheatProject)
      .values({ kind: 'mod', name: 'Both', modrinthId: 'AABBCCDD' })
      .returning();
    const [curseforgeProject] = await db
      .insert(anticheatProject)
      .values({ kind: 'mod', name: 'Both', curseforgeId: '123', decision: 'banned' })
      .returning();
    const other = await pending({
      lookupState: 'found',
      projectId: curseforgeProject!.id,
    });
    const sha512 = await pending({ fingerprint: 4242 });

    await resolveAll(
      client({
        modrinthByHashes: modrinthKnows([sha512]),
        curseforgeByFingerprints: vi.fn(() =>
          Promise.resolve({
            files: new Map([[4242, { fileId: 9, modId: 123, publishedAt: NOW }]]),
            projects: new Map([
              [
                123,
                {
                  id: 123,
                  slug: 'both',
                  name: 'Both',
                  downloadCount: 10,
                  dateCreated: NOW,
                  fetchedAt: NOW,
                },
              ],
            ]),
          }),
        ),
      }),
    );

    const projects = await db.select().from(anticheatProject);
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: modrinthProject!.id,
      modrinthId: 'AABBCCDD',
      curseforgeId: '123',
      decision: 'banned',
    });
    expect((await row(sha512)).projectId).toBe(modrinthProject!.id);
    expect((await row(other)).projectId).toBe(modrinthProject!.id);
    // The ban reaches the files of the merged project.
    expect((await row(other)).score).toBe(0);
    const history = await db
      .select()
      .from(anticheatHistory)
      .where(
        and(eq(anticheatHistory.projectId, modrinthProject!.id), eq(anticheatHistory.kind, 'link')),
      );
    expect(history).toHaveLength(1);
  });

  it('scores a file found nowhere as unknown and sets the retry time', async () => {
    const sha512 = await pending();
    const before = Date.now();
    await resolveAll(client());
    const stored = await row(sha512);
    expect(stored.lookupState).toBe('notFound');
    expect(stored.score).toBe(1);
    const hours = (stored.lookupRetryAt!.getTime() - before) / 3_600_000;
    expect(hours).toBeGreaterThan(5.9);
    expect(hours).toBeLessThan(6.1);
  });

  it('attaches a file found nowhere to the project of its declared mod ID', async () => {
    const a = await pending({ declared: { modId: 'Homebrew', name: 'Homebrew' } });
    const b = await pending({ declared: { modId: 'homebrew' } });
    await resolveAll(client());
    const projects = await db.select().from(anticheatProject);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.declaredModId).toBe('homebrew');
    expect((await row(a)).projectId).toBe(projects[0]!.id);
    expect((await row(b)).projectId).toBe(projects[0]!.id);
  });

  it('leaves a file pending when a platform is down', async () => {
    const sha512 = await pending();
    const { outcomes } = await resolveAll(
      client({
        modrinthByHashes: vi.fn(() => Promise.reject(new CatalogUnavailableError('down'))),
      }),
    );
    expect(outcomes.get(sha512)).toBe('unavailable');
    const stored = await row(sha512);
    expect(stored.lookupState).toBe('pending');
    expect(stored.score).toBeNull();
    // Free for the next sweep.
    expect(stored.lookupStartedAt).toBeNull();
  });

  it('keeps a hit from one platform when the other is down', async () => {
    const sha512 = await pending({ fingerprint: 7 });
    await resolveAll(
      client({
        modrinthByHashes: modrinthKnows([sha512]),
        curseforgeByFingerprints: vi.fn(() => Promise.reject(new CatalogUnavailableError('down'))),
      }),
    );
    expect((await row(sha512)).lookupState).toBe('found');
  });

  it('does not conclude "not found" while one platform is down', async () => {
    const sha512 = await pending({ fingerprint: 7 });
    await resolveAll(
      client({
        curseforgeByFingerprints: vi.fn(() => Promise.reject(new CatalogUnavailableError('down'))),
      }),
    );
    expect((await row(sha512)).lookupState).toBe('pending');
  });

  it('times out a file that waited too long, and scores it as unknown', async () => {
    const old = await pending({ firstSeenAt: new Date(Date.now() - 5 * 60_000) });
    const fresh = await pending();
    const expired = await anticheatLookupService.expire();
    expect(expired).toContain(old);
    expect(expired).not.toContain(fresh);
    expect(await row(old)).toMatchObject({ lookupState: 'timedOut', score: 1 });
    expect((await row(fresh)).lookupState).toBe('pending');
  });

  it('never gives the same file to two claims', async () => {
    const hashes = await Promise.all(Array.from({ length: 20 }, () => pending()));
    const [first, second] = await Promise.all([
      anticheatLookupService.claim(),
      anticheatLookupService.claim(),
    ]);
    const all = [...first, ...second].map((claimed) => claimed.sha512);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(hashes));
    // A file just claimed waits for its lookup before it is claimed again.
    expect(await anticheatLookupService.claim()).toHaveLength(0);
  });

  it('claims a file not found again after its retry time', async () => {
    const due = await pending({
      lookupState: 'notFound',
      lookupRetryAt: new Date(Date.now() - 1000),
    });
    const later = await pending({
      lookupState: 'notFound',
      lookupRetryAt: new Date(Date.now() + 3_600_000),
    });
    const claimed = (await anticheatLookupService.claim()).map((claimed) => claimed.sha512);
    expect(claimed).toContain(due);
    expect(claimed).not.toContain(later);
  });

  it('writes a verdict audit row only when the verdict changed', async () => {
    const { userId, sessionId } = await session();
    const sha512 = hash();
    const answer = await anticheatReportService.submit({
      sessionId,
      files: [file({ sha512 })],
    });
    expect(answer.pending).toBe(1);

    const verdicts = () =>
      db
        .select()
        .from(wardenAudit)
        .where(
          and(eq(wardenAudit.action, 'anticheat.verdict'), eq(wardenAudit.targetUserId, userId)),
        );
    expect(await verdicts()).toHaveLength(0);

    const platforms = client({ modrinthByHashes: modrinthKnows([sha512]) });
    const counts = await anticheatLookupService.run(platforms);
    expect(counts).toMatchObject({ claimed: 1, found: 1, reevaluated: 1 });
    const rows = await verdicts();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).toMatchObject({ sessionId, files: [{ sha512, state: 'scored' }] });

    // The stream carries it.
    const events = await wardenEventService.since(rows[0]!.id - 1);
    expect(events.at(0)?.event.type).toBe('anticheatVerdict');

    // The activity log leaves the stream events out unless they are asked for.
    const log = await wardenAdminService.audit({ userId });
    expect(log.items.map((item) => item.action)).not.toContain('anticheat.verdict');
    expect(
      (await wardenAdminService.audit({ userId, action: 'anticheat.verdict' })).items,
    ).toHaveLength(1);

    // Nothing changed, so nothing is sent.
    expect(await anticheatReportService.reevaluateFor([sha512])).toBe(0);
    expect(await verdicts()).toHaveLength(1);
  });
});
