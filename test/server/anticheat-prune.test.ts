import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  anticheatAlert,
  anticheatFile,
  anticheatPlayer,
  anticheatPlayerEvent,
  anticheatProject,
  anticheatReport,
  anticheatUsage,
  mod,
  user,
} from '~~/server/db/schema';
import { anticheatMaintenanceService } from '~~/server/services/anticheat/maintenance';
import { anticheatReportService } from '~~/server/services/anticheat/reports';
import { anticheatTrustService } from '~~/server/services/anticheat/trust';
import { usersService } from '~~/server/services/users';

import { admin, file, hash, session, setMode } from './anticheat-helpers';

// Reports must not start lookups on the real platforms.
vi.mock('~~/server/services/anticheat/lookup', () => ({
  anticheatLookupService: { kick: vi.fn() },
}));

vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: (fn: unknown) => fn,
  useStorage: () => ({}),
}));

const refreshed = vi.hoisted(() => vi.fn());
vi.mock('~~/server/services/anticheat/platforms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~~/server/services/anticheat/platforms')>()),
  platformProject: refreshed,
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date();
const OLD = new Date(NOW.getTime() - 400 * DAY_MS);
const RECENT = new Date(NOW.getTime() - 30 * DAY_MS);

beforeEach(async () => {
  await setMode('observe');
  await db.delete(mod);
});

afterAll(async () => {
  await db.delete(mod);
});

async function oldFile(values: Partial<typeof anticheatFile.$inferInsert> = {}) {
  const sha512 = hash();
  await db
    .insert(anticheatFile)
    .values({ sha512, kind: 'mod', filename: 'old.jar', lastSeenAt: OLD, ...values });
  return sha512;
}

async function exists(sha512: string) {
  const rows = await db.select().from(anticheatFile).where(eq(anticheatFile.sha512, sha512));
  return rows.length === 1;
}

async function usageOf(userId: string, sha512: string) {
  const rows = await db.select().from(anticheatUsage).where(eq(anticheatUsage.sha512, sha512));
  return rows.filter((row) => row.userId === userId);
}

function usage(userId: string, sha512: string, lastSeenAt: Date) {
  return db
    .insert(anticheatUsage)
    .values({ userId, sha512, lastSeenAt, lastMinecraftUuid: randomUUID() });
}

describe('anticheat prune', () => {
  it('deletes reports older than 12 months and keeps newer ones', async () => {
    const { sessionId } = await session();
    await anticheatReportService.submit({ sessionId, files: [file()] });
    const [report] = await db
      .select()
      .from(anticheatReport)
      .where(eq(anticheatReport.sessionId, sessionId));
    await db
      .update(anticheatReport)
      .set({ createdAt: RECENT })
      .where(eq(anticheatReport.id, report!.id));
    await anticheatMaintenanceService.prune();
    expect(
      await db.select().from(anticheatReport).where(eq(anticheatReport.id, report!.id)),
    ).toHaveLength(1);

    await db
      .update(anticheatReport)
      .set({ createdAt: OLD })
      .where(eq(anticheatReport.id, report!.id));
    const result = await anticheatMaintenanceService.prune();
    expect(result.reports).toBeGreaterThanOrEqual(1);
    expect(
      await db.select().from(anticheatReport).where(eq(anticheatReport.id, report!.id)),
    ).toHaveLength(0);
  });

  it('deletes old usage, but keeps usage of a banned file or a banned project', async () => {
    const { userId } = await session();
    const plain = await oldFile();
    const bannedFile = await oldFile({ decision: 'banned' });
    const [project] = await db
      .insert(anticheatProject)
      .values({
        kind: 'mod',
        name: 'Bad',
        declaredModId: `bad-${randomUUID()}`,
        decision: 'banned',
      })
      .returning();
    const ofBannedProject = await oldFile({ projectId: project!.id });
    const fresh = await oldFile({ lastSeenAt: RECENT });
    await usage(userId, plain, OLD);
    await usage(userId, bannedFile, OLD);
    await usage(userId, ofBannedProject, OLD);
    await usage(userId, fresh, RECENT);

    await anticheatMaintenanceService.prune();

    expect(await usageOf(userId, plain)).toHaveLength(0);
    expect(await usageOf(userId, bannedFile)).toHaveLength(1);
    expect(await usageOf(userId, ofBannedProject)).toHaveLength(1);
    expect(await usageOf(userId, fresh)).toHaveLength(1);
  });

  it('deletes dismissed alerts older than 90 days only', async () => {
    const sha512 = await oldFile({ lastSeenAt: NOW });
    const [old, recent, open] = await db
      .insert(anticheatAlert)
      .values([
        { kind: 'fileRefused', sha512, dismissedAt: new Date(NOW.getTime() - 100 * DAY_MS) },
        { kind: 'bannedFileSeen', sha512, dismissedAt: new Date(NOW.getTime() - 10 * DAY_MS) },
        { kind: 'factsDisputed', sha512, createdAt: OLD },
      ])
      .returning();
    await anticheatMaintenanceService.prune();
    const left = (
      await db.select().from(anticheatAlert).where(eq(anticheatAlert.sha512, sha512))
    ).map((row) => row.id);
    expect(left).not.toContain(old!.id);
    expect(left).toContain(recent!.id);
    expect(left).toContain(open!.id);
  });

  it('deletes files with no usage, no decision and nothing seen for 12 months', async () => {
    const { userId } = await session();
    const unused = await oldFile();
    const decided = await oldFile({ decision: 'approved' });
    const used = await oldFile();
    await usage(userId, used, RECENT);
    const recent = await oldFile({ lastSeenAt: RECENT });

    await anticheatMaintenanceService.prune();

    expect(await exists(unused)).toBe(false);
    expect(await exists(decided)).toBe(true);
    expect(await exists(used)).toBe(true);
    expect(await exists(recent)).toBe(true);
  });
});

describe('anticheat re-score', () => {
  async function scoredStale(rescoreAt: Date) {
    const sha512 = await oldFile({
      lastSeenAt: NOW,
      lookupState: 'notFound',
      score: 99,
      band: 'accepted',
      rescoreAt,
    });
    return sha512;
  }

  it('scores stale files again and leaves the rest', async () => {
    const stale = await scoredStale(new Date(NOW.getTime() - DAY_MS));
    const later = await scoredStale(new Date(NOW.getTime() + 5 * DAY_MS));
    const result = await anticheatMaintenanceService.rescoreStale({ now: NOW });
    expect(result.files).toBeGreaterThanOrEqual(1);
    const [after] = await db.select().from(anticheatFile).where(eq(anticheatFile.sha512, stale));
    expect(after!.score).not.toBe(99);
    expect(after!.rescoreAt!.getTime()).toBeGreaterThan(NOW.getTime());
    const [untouched] = await db
      .select()
      .from(anticheatFile)
      .where(eq(anticheatFile.sha512, later));
    expect(untouched!.score).toBe(99);
  });

  it('skips files still waiting for a lookup and stops when the time is spent', async () => {
    const pending = await oldFile({
      lastSeenAt: NOW,
      rescoreAt: new Date(NOW.getTime() - DAY_MS),
    });
    const done = await anticheatMaintenanceService.rescoreStale({ now: NOW });
    expect(done.incomplete).toBe(false);
    const [row] = await db.select().from(anticheatFile).where(eq(anticheatFile.sha512, pending));
    expect(row!.score).toBeNull();

    await scoredStale(new Date(NOW.getTime() - DAY_MS));
    const spent = await anticheatMaintenanceService.rescoreStale({ now: NOW, budgetMs: 0 });
    expect(spent).toEqual({ files: 0, changed: 0, incomplete: true });
  });
});

describe('re-score refreshes project data', () => {
  it('fetches a project again when its data is older than the re-score time', async () => {
    const modrinthId = `ac-${randomUUID().slice(0, 8)}`;
    const metadata = (downloads: number, fetchedAt: Date) => ({
      id: modrinthId,
      slug: 'x',
      title: 'X',
      projectType: 'mod',
      status: 'approved',
      downloads,
      publishedAt: OLD.toISOString(),
      serverSide: 'required',
      fetchedAt: fetchedAt.toISOString(),
    });
    const [project] = await db
      .insert(anticheatProject)
      .values({ kind: 'mod', name: 'X', modrinthId, modrinth: metadata(5, OLD) })
      .returning();
    const sha512 = await oldFile({
      lastSeenAt: NOW,
      projectId: project!.id,
      lookupState: 'found',
      score: 10,
      band: 'low',
      rescoreAt: new Date(NOW.getTime() - DAY_MS),
    });
    refreshed.mockResolvedValueOnce({
      id: modrinthId,
      name: 'X',
      modrinth: metadata(50000, NOW),
    });
    await anticheatMaintenanceService.rescoreStale({ now: NOW });
    expect(refreshed).toHaveBeenCalledWith('modrinth', modrinthId);
    const [after] = await db
      .select()
      .from(anticheatProject)
      .where(eq(anticheatProject.id, project!.id));
    expect(after!.modrinth!.downloads).toBe(50000);
    const [scored] = await db.select().from(anticheatFile).where(eq(anticheatFile.sha512, sha512));
    expect(scored!.score).not.toBe(10);
  });

  it('keeps the stored data when the platform is unreachable', async () => {
    const { CatalogUnavailableError } = await import('~~/server/services/anticheat/platforms');
    const modrinthId = `ac-${randomUUID().slice(0, 8)}`;
    const data = {
      id: modrinthId,
      slug: 'y',
      title: 'Y',
      projectType: 'mod',
      status: 'approved',
      downloads: 7,
      publishedAt: OLD.toISOString(),
      serverSide: 'required',
      fetchedAt: OLD.toISOString(),
    };
    const [project] = await db
      .insert(anticheatProject)
      .values({ kind: 'mod', name: 'Y', modrinthId, modrinth: data })
      .returning();
    await oldFile({
      lastSeenAt: NOW,
      projectId: project!.id,
      lookupState: 'found',
      score: 10,
      band: 'low',
      rescoreAt: new Date(NOW.getTime() - DAY_MS),
    });
    refreshed.mockRejectedValueOnce(new CatalogUnavailableError('modrinth'));
    await anticheatMaintenanceService.rescoreStale({ now: NOW });
    const [after] = await db
      .select()
      .from(anticheatProject)
      .where(eq(anticheatProject.id, project!.id));
    expect(after!.modrinth!.downloads).toBe(7);
  });
});

describe('deleting an account', () => {
  it('removes its anticheat reports, usage, player row and events', async () => {
    const { userId, sessionId } = await session();
    const sha512 = hash();
    await anticheatReportService.submit({ sessionId, files: [file({ sha512 })] });
    await anticheatTrustService.serverEvents({
      sessionId,
      events: [{ id: randomUUID(), kind: 'challengeWrong', data: {} }],
    });
    expect(
      await db.select().from(anticheatReport).where(eq(anticheatReport.userId, userId)),
    ).not.toHaveLength(0);
    expect(await usageOf(userId, sha512)).toHaveLength(1);
    expect(
      await db.select().from(anticheatPlayer).where(eq(anticheatPlayer.userId, userId)),
    ).toHaveLength(1);
    expect(
      await db.select().from(anticheatPlayerEvent).where(eq(anticheatPlayerEvent.userId, userId)),
    ).not.toHaveLength(0);

    await usersService.remove({ actorId: admin, userId });

    expect(await db.select().from(user).where(eq(user.id, userId))).toHaveLength(0);
    expect(
      await db.select().from(anticheatReport).where(eq(anticheatReport.userId, userId)),
    ).toHaveLength(0);
    expect(await usageOf(userId, sha512)).toHaveLength(0);
    expect(
      await db.select().from(anticheatPlayer).where(eq(anticheatPlayer.userId, userId)),
    ).toHaveLength(0);
    expect(
      await db.select().from(anticheatPlayerEvent).where(eq(anticheatPlayerEvent.userId, userId)),
    ).toHaveLength(0);
    // The file itself is not the account's: it stays.
    expect(await exists(sha512)).toBe(true);
  });
});
