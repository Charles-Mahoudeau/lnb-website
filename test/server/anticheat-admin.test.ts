import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  anticheatAlert,
  anticheatFile,
  anticheatHistory,
  anticheatModIdBan,
  anticheatPlayer,
  anticheatProject,
  anticheatUsage,
  mod,
  wardenAudit,
} from '~~/server/db/schema';
import { anticheatAdminService } from '~~/server/services/anticheat/admin';
import { anticheatRegistryService } from '~~/server/services/anticheat/registry';
import { anticheatReportService } from '~~/server/services/anticheat/reports';
import { anticheatRosterService } from '~~/server/services/anticheat/roster';
import { anticheatSettingsService } from '~~/server/services/anticheat/settings';
import { anticheatTrustService } from '~~/server/services/anticheat/trust';
import { wardenModerationService } from '~~/server/services/warden/moderation';

import { admin, hash, session, setMode } from './anticheat-helpers';

// The platform client reaches the mod catalog, which caches through Nitro.
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: (fn: unknown) => fn,
  useStorage: () => ({}),
}));

// Reports must not start lookups on the real platforms, and a merge must not need the network.
vi.mock('~~/server/services/anticheat/lookup', async (importOriginal) => {
  const original = await importOriginal<typeof import('~~/server/services/anticheat/lookup')>();
  return {
    anticheatLookupService: { ...original.anticheatLookupService, kick: vi.fn() },
  };
});

const actor = { source: 'web', userId: admin } as const;

beforeEach(async () => {
  await setMode('enforce');
  await db.delete(mod);
  await db.delete(anticheatProject);
});

afterAll(async () => {
  await db.delete(mod);
  await db.delete(anticheatProject);
  await db.delete(anticheatModIdBan);
  await setMode('observe');
});

let counter = 0;

/** A project with a file the platforms confirmed, so it scores by its metadata. */
async function projectWith(files = 1) {
  const [project] = await db
    .insert(anticheatProject)
    .values({
      kind: 'mod',
      name: `Project ${String(++counter)}`,
      modrinthId: `mr-${String(counter)}-${String(Date.now())}`,
    })
    .returning();
  const hashes: string[] = [];
  for (let i = 0; i < files; i++) {
    const sha512 = hash();
    hashes.push(sha512);
    await db.insert(anticheatFile).values({
      sha512,
      kind: 'mod',
      filename: `v${String(i)}.jar`,
      projectId: project!.id,
      lookupState: 'found',
      platformVersion: {
        modrinth: {
          versionId: `v${String(i)}`,
          versionNumber: `1.${String(i)}`,
          loaders: ['neoforge'],
          publishedAt: '2024-01-01T00:00:00Z',
        },
      },
    });
  }
  await anticheatAdminService.rescoreAll();
  for (const sha512 of hashes) await anticheatAdminService.rescoreFile(sha512);
  return { projectId: project!.id, hashes };
}

async function stored(sha512: string) {
  const [row] = await db.select().from(anticheatFile).where(eq(anticheatFile.sha512, sha512));
  return row!;
}

/** A file whose lookup ended with nothing, so its score comes from the rules alone. */
async function unknownFile(filename = `unknown-${hash().slice(0, 8)}.jar`) {
  const sha512 = hash();
  await db.insert(anticheatFile).values({ sha512, kind: 'mod', filename, lookupState: 'notFound' });
  await anticheatAdminService.rescoreFile(sha512);
  return sha512;
}

describe('decisions', () => {
  it('scores every version of a banned project 0, over an approved hash, and clearing restores them', async () => {
    const { projectId, hashes } = await projectWith(2);
    const before = await Promise.all(hashes.map(async (h) => (await stored(h)).score));
    await anticheatAdminService.decideFile({
      actor,
      sha512: hashes[0]!,
      body: { decision: 'approved' },
    });
    expect((await stored(hashes[0]!)).score).toBe(100);

    await anticheatAdminService.decideProject({
      actor,
      projectId,
      body: { decision: 'banned', note: 'cheat client' },
    });
    for (const h of hashes) {
      const row = await stored(h);
      expect([row.score, row.band]).toEqual([0, 'banned']);
    }

    await anticheatAdminService.decideProject({ actor, projectId, body: { decision: null } });
    expect((await stored(hashes[0]!)).score).toBe(100);
    expect((await stored(hashes[1]!)).score).toBe(before[1]);
  });

  it('counts the players a ban affects and raises one alert', async () => {
    const { projectId, hashes } = await projectWith(1);
    const { userId } = await session();
    await db.insert(anticheatUsage).values({
      userId,
      sha512: hashes[0]!,
      lastMinecraftUuid: crypto.randomUUID(),
    });
    const result = await anticheatAdminService.decideProject({
      actor,
      projectId,
      body: { decision: 'banned' },
    });
    expect(result.affectedPlayers).toBe(1);
    const alerts = await db
      .select()
      .from(anticheatAlert)
      .where(eq(anticheatAlert.kind, 'banAffectsPlayers'));
    expect(alerts.some((a) => a.data.projectId === projectId)).toBe(true);

    const none = await anticheatAdminService.decideProject({
      actor,
      projectId,
      body: { decision: 'approved' },
    });
    expect(none.affectedPlayers).toBe(0);
  });

  it('writes history and audit rows for a decision', async () => {
    const sha512 = await unknownFile();
    await anticheatAdminService.decideFile({
      actor,
      sha512,
      body: { decision: 'banned', note: 'seen on a cheat list' },
    });
    const history = await db
      .select()
      .from(anticheatHistory)
      .where(eq(anticheatHistory.sha512, sha512));
    expect(history.map((h) => h.kind)).toContain('ban');
    const audit = await db
      .select()
      .from(wardenAudit)
      .where(eq(wardenAudit.action, 'anticheat.ban'));
    expect(audit.some((a) => a.data.sha512 === sha512 && a.actorUserId === admin)).toBe(true);
  });

  it('refuses a file or a project it does not know', async () => {
    await expect(
      anticheatAdminService.decideFile({ actor, sha512: hash(), body: { decision: 'banned' } }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      anticheatAdminService.decideProject({
        actor,
        projectId: crypto.randomUUID(),
        body: { decision: 'banned' },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('review', () => {
  it('takes an accepted file out of the queue until its band changes', async () => {
    const { hashes } = await projectWith(1);
    const sha512 = hashes[0]!;
    // Force a score in the accepted band, as a project with good metadata would have.
    await db
      .update(anticheatFile)
      .set({ score: 80, band: 'accepted', reviewedAt: null, reviewedBand: null })
      .where(eq(anticheatFile.sha512, sha512));
    const inQueue = async () =>
      (await anticheatRegistryService.files({ status: 'review', sort: 'recent' })).items.some(
        (row) => row.projectId !== null,
      );
    expect(await inQueue()).toBe(true);

    await anticheatAdminService.markReviewed({ actor, sha512 });
    expect(await inQueue()).toBe(false);

    // A decision changes the band, which clears the review; clearing it brings the old band back
    // as a new question.
    await anticheatAdminService.decideFile({ actor, sha512, body: { decision: 'approved' } });
    expect((await stored(sha512)).reviewedBand).toBeNull();
  });

  it('cannot review a file that has no score yet', async () => {
    const sha512 = hash();
    await db
      .insert(anticheatFile)
      .values({ sha512, kind: 'mod', filename: 'wait.jar', lookupState: 'pending' });
    await expect(anticheatAdminService.markReviewed({ actor, sha512 })).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('the registry', () => {
  it('groups the versions of a project and counts the players waiting', async () => {
    const { projectId, hashes } = await projectWith(2);
    const waitingHash = hash();
    await db.insert(anticheatFile).values({
      sha512: waitingHash,
      kind: 'mod',
      filename: 'new.jar',
      projectId,
      lookupState: 'pending',
    });
    const { sessionId } = await session();
    await anticheatReportService.submit({
      sessionId,
      files: [
        { kind: 'mod', sha512: waitingHash, filename: 'new.jar' },
        { kind: 'mod', sha512: hashes[0]!, filename: 'v0.jar' },
      ],
    });

    const page = await anticheatRegistryService.files({ sort: 'queue' });
    const row = page.items.find((item) => item.projectId === projectId);
    expect(row).toMatchObject({ fileCount: 3, platforms: ['modrinth'], sha512: null });
    expect(row?.usingNow).toBe(1);
    expect(row?.waiting).toBe(1);
    // Projects with waiting players come first.
    expect(page.items[0]?.projectId).toBe(projectId);

    const detail = await anticheatRegistryService.project(projectId);
    expect(detail.files).toHaveLength(3);
  });

  it('searches by hash prefix, filename and project name, and lists a file with no project alone', async () => {
    const { projectId, hashes } = await projectWith(1);
    const alone = await unknownFile('lonely-one.jar');
    const byPrefix = await anticheatRegistryService.files({
      q: hashes[0]!.slice(0, 12),
      sort: 'recent',
    });
    expect(byPrefix.items.map((i) => i.projectId)).toEqual([projectId]);
    const byFile = await anticheatRegistryService.files({ q: 'lonely-one', sort: 'recent' });
    expect(byFile.items).toMatchObject([{ sha512: alone, projectId: null, fileCount: 1 }]);
  });

  it('pages the players of a file and flags those who used it after a ban', async () => {
    const { hashes } = await projectWith(1);
    const { userId } = await session();
    await db.insert(anticheatUsage).values({
      userId,
      sha512: hashes[0]!,
      lastMinecraftUuid: crypto.randomUUID(),
    });
    expect((await anticheatRegistryService.filePlayers(hashes[0]!, {})).items[0]).toMatchObject({
      afterBan: false,
    });
    await anticheatAdminService.decideFile({
      actor,
      sha512: hashes[0]!,
      body: { decision: 'banned' },
    });
    // Later than the ban.
    await db
      .update(anticheatUsage)
      .set({ lastSeenAt: new Date(Date.now() + 60_000) })
      .where(eq(anticheatUsage.userId, userId));
    const players = await anticheatRegistryService.filePlayers(hashes[0]!, {});
    expect(players.items[0]).toMatchObject({ afterBan: true, player: { userId } });
    const detail = await anticheatRegistryService.file(hashes[0]!);
    expect(detail.decision.decision).toBe('banned');
    expect(detail.players.items).toHaveLength(1);
  });

  it('rejects a cursor it did not make', async () => {
    await expect(
      anticheatRegistryService.files({ cursor: 'not-a-cursor', sort: 'recent' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('projects', () => {
  it('merges two projects and splits a platform off again', async () => {
    const a = await projectWith(1);
    const b = await projectWith(1);
    await db
      .update(anticheatProject)
      .set({ curseforgeId: '123' })
      .where(eq(anticheatProject.id, b.projectId));
    await anticheatAdminService.link({
      actor,
      projectId: a.projectId,
      otherProjectId: b.projectId,
    });
    const merged = await anticheatRegistryService.project(a.projectId);
    expect(merged).toMatchObject({ curseforgeId: '123' });
    expect(merged.files).toHaveLength(2);
    await expect(anticheatRegistryService.project(b.projectId)).rejects.toMatchObject({
      statusCode: 404,
    });

    // The second file was found on Modrinth too, so it stays; mark one as CurseForge only.
    await db
      .update(anticheatFile)
      .set({ platformVersion: { curseforge: { fileId: 9, publishedAt: '2024-01-01T00:00:00Z' } } })
      .where(eq(anticheatFile.sha512, b.hashes[0]!));
    const { id } = await anticheatAdminService.unlink({
      actor,
      projectId: a.projectId,
      platform: 'curseforge',
    });
    const split = await anticheatRegistryService.project(id);
    expect(split.curseforgeId).toBe('123');
    expect(split.files.map((f) => f.sha512)).toEqual([b.hashes[0]]);
    expect((await anticheatRegistryService.project(a.projectId)).curseforgeId).toBeNull();
  });

  it('refuses to merge a project with itself or to split one that is not linked', async () => {
    const { projectId } = await projectWith(1);
    await expect(
      anticheatAdminService.link({ actor, projectId, otherProjectId: projectId }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      anticheatAdminService.unlink({ actor, projectId, platform: 'modrinth' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('keeps the stricter decision when merging', async () => {
    const a = await projectWith(1);
    const b = await projectWith(1);
    await anticheatAdminService.decideProject({
      actor,
      projectId: b.projectId,
      body: { decision: 'banned' },
    });
    await anticheatAdminService.decideProject({
      actor,
      projectId: a.projectId,
      body: { decision: 'approved' },
    });
    await anticheatAdminService.link({
      actor,
      projectId: a.projectId,
      otherProjectId: b.projectId,
    });
    expect((await anticheatRegistryService.project(a.projectId)).decision.decision).toBe('banned');
    expect((await stored(a.hashes[0]!)).score).toBe(0);
  });
});

describe('mod ID bans', () => {
  it('bans a declared mod ID, scores its files, and lifts the ban', async () => {
    const sha512 = hash();
    await db.insert(anticheatFile).values({
      sha512,
      kind: 'mod',
      filename: 'x.jar',
      declared: { modId: 'CheatMod' },
      lookupState: 'notFound',
    });
    await anticheatAdminService.banModId({ actor, modId: 'cheatmod', reason: 'a hacked client' });
    expect((await stored(sha512)).band).toBe('banned');
    expect(await anticheatAdminService.modIdBans()).toMatchObject([
      { modId: 'cheatmod', reason: 'a hacked client', createdBy: 'Admin' },
    ]);
    await expect(
      anticheatAdminService.banModId({ actor, modId: 'cheatmod', reason: 'again' }),
    ).rejects.toMatchObject({ statusCode: 409 });

    await anticheatAdminService.unbanModId({ actor, modId: 'cheatmod' });
    expect((await stored(sha512)).band).not.toBe('banned');
    await expect(
      anticheatAdminService.unbanModId({ actor, modId: 'cheatmod' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('re-scoring', () => {
  it('marks every file stale', async () => {
    const sha512 = await unknownFile();
    await db
      .update(anticheatFile)
      .set({ rescoreAt: new Date(Date.now() + 86_400_000) })
      .where(eq(anticheatFile.sha512, sha512));
    expect(await anticheatAdminService.rescoreAll()).toBeGreaterThan(0);
    expect((await stored(sha512)).rescoreAt!.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('the settings the scoring reads', () => {
  it('stays on the current rules version', async () => {
    const { rulesVersion } = await anticheatSettingsService.get();
    const sha512 = await unknownFile();
    expect((await stored(sha512)).rulesVersion).toBe(rulesVersion);
  });
});

describe('bulk actions on the players of a file', () => {
  async function usedBy(sha512: string, count: number) {
    const userIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const { userId } = await session();
      await db.insert(anticheatUsage).values({
        userId,
        sha512,
        lastMinecraftUuid: crypto.randomUUID(),
      });
      userIds.push(userId);
    }
    return userIds;
  }

  it('bans the players, skips one already banned and one who never used the file', async () => {
    const sha512 = await unknownFile();
    const [a, b] = await usedBy(sha512, 2);
    const stranger = (await session()).userId;
    await wardenModerationService.ban({
      userId: b!,
      body: { reason: 'earlier', durationSeconds: null },
      actor,
    });

    const result = await anticheatAdminService.bulkPlayers({
      actor,
      sha512,
      body: { userIds: [a!, b!, stranger, a!], action: 'ban', reason: 'cheat client' },
    });
    expect(result.applied).toBe(1);
    expect(result.skipped).toEqual([
      { userId: b, why: 'alreadyBanned' },
      { userId: stranger, why: 'notAPlayer' },
    ]);
    expect(await wardenModerationService.activeBan(a!)).toMatchObject({ reason: 'cheat client' });
    const audit = await db
      .select()
      .from(wardenAudit)
      .where(eq(wardenAudit.action, 'anticheat.bulk'));
    expect(audit.some((row) => row.data.sha512 === sha512 && row.data.applied === 1)).toBe(true);
  });

  it('holds players once and takes points with a penalty', async () => {
    const sha512 = await unknownFile();
    const [a] = await usedBy(sha512, 1);
    const hold = { userIds: [a!], action: 'hold' as const, reason: 'to talk to' };
    expect((await anticheatAdminService.bulkPlayers({ actor, sha512, body: hold })).applied).toBe(
      1,
    );
    expect(
      (await anticheatAdminService.bulkPlayers({ actor, sha512, body: hold })).skipped,
    ).toEqual([{ userId: a, why: 'alreadyHeld' }]);

    const before = (await anticheatRosterService.player(a!)).score;
    await anticheatAdminService.bulkPlayers({
      actor,
      sha512,
      body: { userIds: [a!], action: 'penalty', reason: 'used it', points: 20 },
    });
    const detail = await anticheatRosterService.player(a!);
    expect(detail.score).toBe(before - 20);
    expect(detail.events.items.map((e) => e.kind)).toContain('bulkPenalty');
    expect(detail.manualHold).toBe(true);
  });
});

describe('players', () => {
  it('lists the lowest scores first and filters by band', async () => {
    const low = (await session()).userId;
    const high = (await session()).userId;
    await anticheatTrustService.adjust({ actor, userId: low, score: 5, reason: 'seen cheating' });
    await anticheatTrustService.adjust({ actor, userId: high, score: 90, reason: 'vouched for' });
    const page = await anticheatRosterService.players({});
    const ids = page.items.map((row) => row.player.userId);
    expect(ids.indexOf(low)).toBeLessThan(ids.indexOf(high));
    expect(page.items.find((row) => row.player.userId === low)).toMatchObject({ band: 'held' });

    const trusted = await anticheatRosterService.players({ band: 'trusted' });
    expect(trusted.items.map((row) => row.player.userId)).toContain(high);
    expect(trusted.items.map((row) => row.player.userId)).not.toContain(low);
    const found = await anticheatRosterService.players({ q: 'Anticheat Tester' });
    expect(found.items.length).toBeGreaterThan(0);
  });

  it('shows one player with the timeline, hold and usage, fewest other users first', async () => {
    const { userId } = await session();
    const rare = await unknownFile();
    const common = await unknownFile();
    const other = (await session()).userId;
    const uuid = crypto.randomUUID();
    await db.insert(anticheatUsage).values([
      { userId, sha512: common, lastMinecraftUuid: uuid },
      { userId, sha512: rare, lastMinecraftUuid: uuid },
      { userId: other, sha512: common, lastMinecraftUuid: uuid },
    ]);
    await anticheatTrustService.adjust({ actor, userId, score: 80, reason: 'checked' });
    await anticheatTrustService.setHold({ actor, userId, hold: true, reason: 'check the mods' });

    const detail = await anticheatRosterService.player(userId);
    expect(detail).toMatchObject({
      score: 80,
      band: 'trusted',
      adjustment: 6,
      manualHold: true,
      holdReason: 'check the mods',
    });
    expect(detail.events.items.map((e) => e.kind)).toEqual(['holdSet', 'adminAdjust']);
    expect(detail.usage.map((u) => [u.sha512, u.otherUsers])).toEqual([
      [rare, 0],
      [common, 1],
    ]);
  });

  it('pages the timeline by the last id', async () => {
    const { userId } = await session();
    for (let i = 0; i < 32; i++) {
      await anticheatTrustService.adjust({
        actor,
        userId,
        score: i % 100,
        reason: `step ${String(i)}`,
      });
    }
    const first = await anticheatRosterService.player(userId);
    expect(first.events.items).toHaveLength(30);
    expect(first.events.nextCursor).not.toBeNull();
    const rest = await anticheatRosterService.events(userId, first.events.nextCursor!);
    expect(rest.items).toHaveLength(2);
    expect(rest.nextCursor).toBeNull();
    await expect(anticheatRosterService.events(userId, 'x')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('refuses a player that does not exist', async () => {
    await expect(anticheatRosterService.player('nobody')).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      anticheatTrustService.adjust({ actor, userId: 'nobody', score: 10, reason: 'x' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      anticheatTrustService.setHold({ actor, userId: 'nobody', hold: true, reason: 'x' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(
      await db.select().from(anticheatPlayer).where(eq(anticheatPlayer.userId, 'nobody')),
    ).toEqual([]);
  });
});

describe('the routes', () => {
  it('check for a Warden admin before anything else', () => {
    const root = join(process.cwd(), 'server/api/anticheat/admin');
    const routes = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? routes(join(dir, entry.name)) : [join(dir, entry.name)],
      );
    const found = routes(root);
    expect(found.length).toBeGreaterThan(0);
    for (const path of found) {
      expect(readFileSync(path, 'utf8'), path).toMatch(
        /defineEventHandler\(async \(event\) => \{\n\s+(const admin = )?await requireWardenAdmin\(event\);/,
      );
    }
  });
});
