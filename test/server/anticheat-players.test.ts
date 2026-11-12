import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  anticheatActionTaken,
  anticheatFile,
  anticheatPlayer,
  anticheatPlayerEvent,
  anticheatReport,
  mod,
  wardenAudit,
  wardenSession,
} from '~~/server/db/schema';
import { anticheatPlayerService } from '~~/server/services/anticheat/players';
import { anticheatReportService } from '~~/server/services/anticheat/reports';
import { anticheatSettingsService } from '~~/server/services/anticheat/settings';
import { anticheatTrustService } from '~~/server/services/anticheat/trust';
import { wardenSessionService } from '~~/server/services/warden/sessions';

import { admin, file, hash, session, setMode } from './anticheat-helpers';

// Reports must not start lookups on the real platforms.
vi.mock('~~/server/services/anticheat/lookup', () => ({
  anticheatLookupService: { kick: vi.fn() },
}));

const actor = { source: 'web', userId: admin } as const;

beforeEach(async () => {
  await setMode('enforce');
  // The official list decides the modlist check: every test starts from an empty one.
  await db.delete(mod);
});

afterAll(async () => {
  await db.delete(mod);
  await setMode('observe');
});

async function events(userId: string) {
  return db
    .select()
    .from(anticheatPlayerEvent)
    .where(eq(anticheatPlayerEvent.userId, userId))
    .orderBy(anticheatPlayerEvent.id);
}

async function scoreOf(userId: string) {
  return (await anticheatPlayerService.get(db, userId)).score;
}

function send(sessionId: string, kind: 'challengeWrong' | 'challengeMissed' | 'modSetChanged') {
  return anticheatTrustService.serverEvents({
    sessionId,
    events: [{ id: randomUUID(), kind, data: {} }],
  });
}

/** A scored file the site already knows, as found on Modrinth unless told otherwise. */
async function scoredFile(score: number, found = true) {
  const sha512 = hash();
  await db.insert(anticheatFile).values({
    sha512,
    kind: 'mod',
    filename: 'scored.jar',
    lookupState: found ? 'found' : 'notFound',
    score,
    band: score >= 75 ? 'accepted' : score >= 40 ? 'middle' : 'low',
    rulesVersion: (await anticheatSettingsService.get()).rulesVersion,
    platformVersion: found
      ? {
          modrinth: {
            versionId: 'v1',
            versionNumber: '1.0',
            loaders: ['neoforge'],
            publishedAt: '2024-01-01T00:00:00Z',
          },
        }
      : null,
  });
  return sha512;
}

describe('player events', () => {
  it('moves the score by each kind of event', async () => {
    const { sessionId, userId } = await session();
    expect((await send(sessionId, 'challengeWrong')).player.score).toBe(25);
    expect((await send(sessionId, 'modSetChanged')).player.score).toBe(0);
    const stored = await events(userId);
    expect(stored.map((e) => [e.kind, e.delta, e.applied])).toEqual([
      ['challengeWrong', -25, true],
      ['modSetChanged', -25, true],
    ]);
    // The score stays between 0 and 100: the second event could only take 25.
    expect(stored[1]!.scoreAfter).toBe(0);
  });

  it('stops missed challenges at the cap of a session', async () => {
    const { sessionId, userId } = await session();
    for (let i = 0; i < 5; i++) await send(sessionId, 'challengeMissed');
    // -5 each, stopping at -15 in one session.
    expect(await scoreOf(userId)).toBe(35);
    expect((await events(userId)).map((e) => e.delta)).toEqual([-5, -5, -5, 0, 0]);
  });

  it('skips an event whose id is already stored', async () => {
    const { sessionId, userId } = await session();
    const body = {
      sessionId,
      events: [{ id: randomUUID(), kind: 'challengeWrong' as const, data: {} }],
    };
    await anticheatTrustService.serverEvents(body);
    const again = await anticheatTrustService.serverEvents(body);
    expect(again.player.score).toBe(25);
    expect(await events(userId)).toHaveLength(1);
  });

  it('skips a duplicate sent twice at once', async () => {
    const { sessionId, userId } = await session();
    const body = {
      sessionId,
      events: [{ id: randomUUID(), kind: 'challengeWrong' as const, data: {} }],
    };
    await Promise.all([
      anticheatTrustService.serverEvents(body),
      anticheatTrustService.serverEvents(body),
    ]);
    expect(await events(userId)).toHaveLength(1);
    expect(await scoreOf(userId)).toBe(25);
  });

  it('records without applying in observe mode', async () => {
    await setMode('observe');
    const { sessionId, userId } = await session();
    const answer = await send(sessionId, 'challengeWrong');
    expect(answer.player.score).toBe(50);
    expect(await events(userId)).toMatchObject([
      { kind: 'challengeWrong', delta: -25, applied: false },
    ]);
  });

  it('stores nothing when the mode is off', async () => {
    await setMode('off');
    const { sessionId, userId } = await session();
    const answer = await send(sessionId, 'challengeWrong');
    expect(answer.verdict).toEqual({ action: 'allow', reasons: [] });
    expect(await events(userId)).toHaveLength(0);
  });

  it('refuses an unknown or ended session', async () => {
    await expect(send(randomUUID(), 'challengeWrong')).rejects.toMatchObject({
      statusCode: 404,
      data: { problem: 'unknownSession' },
    });
    const { sessionId } = await session();
    await wardenSessionService.end({ sessionId, reason: 'quit' });
    await expect(send(sessionId, 'challengeWrong')).rejects.toMatchObject({
      data: { problem: 'unknownSession' },
    });
  });

  it('answers with the verdict worked out from the new score', async () => {
    const { sessionId } = await session();
    await anticheatReportService.submit({ sessionId, files: [file()] });
    // 50 - 25 = 25: in the held band.
    const answer = await send(sessionId, 'challengeWrong');
    expect(answer.player).toEqual({ score: 25, band: 'held' });
    expect(answer.verdict.action).toBe('hold');
    expect(answer.verdict.reasons.map((r) => r.code)).toContain('playerHeld');
  });

  it('tells the stream when an event changes the verdict of a session', async () => {
    const { sessionId, userId } = await session();
    await anticheatReportService.submit({ sessionId, files: [file()] });
    await send(sessionId, 'challengeWrong');
    const rows = await db
      .select({ id: wardenAudit.id })
      .from(wardenAudit)
      .where(
        and(eq(wardenAudit.action, 'anticheat.verdict'), eq(wardenAudit.targetUserId, userId)),
      );
    expect(rows).toHaveLength(1);
  });
});

describe('playtime', () => {
  it('earns trust by the hour', async () => {
    const { sessionId, userId } = await session();
    await db.transaction((tx) =>
      anticheatPlayerService.creditPlaytime(tx, { id: sessionId, userId, seconds: 2.5 * 3600 }),
    );
    expect(await scoreOf(userId)).toBe(52);
    expect((await events(userId))[0]).toMatchObject({ kind: 'playtime', delta: 2, applied: true });
  });

  it('records nothing for less than an hour', async () => {
    const { sessionId, userId } = await session();
    await db.transaction((tx) =>
      anticheatPlayerService.creditPlaytime(tx, { id: sessionId, userId, seconds: 3599 }),
    );
    expect(await events(userId)).toHaveLength(0);
  });

  it('stops at the daily cap, counting what was gained today', async () => {
    const first = await session();
    await db.transaction((tx) =>
      anticheatPlayerService.creditPlaytime(tx, {
        id: first.sessionId,
        userId: first.userId,
        seconds: 3 * 3600,
      }),
    );
    // Another session of the same player: only 2 of the 4 hours fit under the cap of 5.
    const [other] = await db
      .insert(wardenSession)
      .values({
        userId: first.userId,
        minecraftUuid: (
          await db
            .select({ uuid: wardenSession.minecraftUuid })
            .from(wardenSession)
            .where(eq(wardenSession.id, first.sessionId))
        )[0]!.uuid,
      })
      .returning({ id: wardenSession.id });
    await db.transaction((tx) =>
      anticheatPlayerService.creditPlaytime(tx, {
        id: other!.id,
        userId: first.userId,
        seconds: 4 * 3600,
      }),
    );
    expect(await scoreOf(first.userId)).toBe(55);
    const third = await db
      .insert(wardenSession)
      .values({
        userId: first.userId,
        minecraftUuid: (
          await db
            .select({ uuid: wardenSession.minecraftUuid })
            .from(wardenSession)
            .where(eq(wardenSession.id, first.sessionId))
        )[0]!.uuid,
      })
      .returning({ id: wardenSession.id });
    await db.transaction((tx) =>
      anticheatPlayerService.creditPlaytime(tx, {
        id: third[0]!.id,
        userId: first.userId,
        seconds: 9 * 3600,
      }),
    );
    expect(await scoreOf(first.userId)).toBe(55);
  });

  it('gives nothing to a session that had a penalty', async () => {
    const { sessionId, userId } = await session();
    await send(sessionId, 'challengeMissed');
    await db.transaction((tx) =>
      anticheatPlayerService.creditPlaytime(tx, { id: sessionId, userId, seconds: 5 * 3600 }),
    );
    expect(await scoreOf(userId)).toBe(45);
  });

  it('counts a penalty that was only recorded in observe mode', async () => {
    await setMode('observe');
    const { sessionId, userId } = await session();
    await send(sessionId, 'challengeWrong');
    await db.transaction((tx) =>
      anticheatPlayerService.creditPlaytime(tx, { id: sessionId, userId, seconds: 5 * 3600 }),
    );
    expect((await events(userId)).map((e) => e.kind)).toEqual(['challengeWrong']);
  });

  it('is credited when the session closes', async () => {
    const { sessionId, userId } = await session();
    await db
      .update(wardenSession)
      .set({ startedAt: new Date(Date.now() - 2 * 3600 * 1000 - 5000) })
      .where(eq(wardenSession.id, sessionId));
    await wardenSessionService.end({ sessionId, reason: 'quit' });
    expect(await scoreOf(userId)).toBe(52);
    // Closing it again changes nothing.
    await wardenSessionService.end({ sessionId, reason: 'quit' });
    expect(await scoreOf(userId)).toBe(52);
  });

  it('gives nothing when the mode is off', async () => {
    await setMode('off');
    const { sessionId, userId } = await session();
    await db.transaction((tx) =>
      anticheatPlayerService.creditPlaytime(tx, { id: sessionId, userId, seconds: 5 * 3600 }),
    );
    expect(await events(userId)).toHaveLength(0);
  });
});

describe('modlist check', () => {
  async function officialMod(name = 'Required mod') {
    await db.insert(mod).values({
      list: 'official',
      source: 'modrinth',
      sourceId: `mr-${randomUUID()}`,
      name,
      pageUrl: 'https://modrinth.com/mod/required',
    });
  }

  it('costs trust once per session when a required mod is missing', async () => {
    await officialMod();
    const { sessionId, userId } = await session();
    const first = await anticheatReportService.submit({
      sessionId,
      files: [file({ sha512: await scoredFile(60) })],
    });
    expect(first.player).toEqual({ score: 10, band: 'held' });
    const [report] = await db
      .select()
      .from(anticheatReport)
      .where(eq(anticheatReport.id, first.reportId!));
    expect(report).toMatchObject({ modlistChecked: true, modlistMissing: ['Required mod'] });
    // A later report of the same session is not checked again.
    const second = await anticheatReportService.submit({
      sessionId,
      files: [file({ sha512: await scoredFile(60) })],
    });
    expect(second.player!.score).toBe(10);
    expect((await events(userId)).filter((e) => e.kind === 'modlistIncomplete')).toHaveLength(1);
  });

  it('skips optional entries', async () => {
    await db.insert(mod).values({
      list: 'official',
      source: 'modrinth',
      sourceId: `mr-${randomUUID()}`,
      name: 'Optional mod',
      pageUrl: 'https://modrinth.com/mod/optional',
      optional: true,
    });
    const { sessionId, userId } = await session();
    const answer = await anticheatReportService.submit({
      sessionId,
      files: [file({ sha512: await scoredFile(60) })],
    });
    expect(answer.player!.score).toBe(50);
    expect(await events(userId)).toHaveLength(0);
  });

  it('is satisfied by a file tied to the entry by its hash', async () => {
    const sha512 = await scoredFile(60);
    await db.insert(mod).values({
      list: 'official',
      source: 'manual',
      name: 'By hand',
      pageUrl: 'https://example.org',
      fileSha512: sha512,
    });
    const { sessionId, userId } = await session();
    const answer = await anticheatReportService.submit({
      sessionId,
      files: [file({ sha512 })],
    });
    expect(answer.player!.score).toBe(50);
    expect(await events(userId)).toHaveLength(0);
  });

  it('waits for the pending files', async () => {
    await officialMod();
    const { sessionId, userId } = await session();
    const sha512 = hash();
    const answer = await anticheatReportService.submit({
      sessionId,
      files: [file({ sha512 })],
    });
    // The new file is pending: nothing is decided yet.
    expect(answer.pending).toBe(1);
    expect(answer.player!.score).toBe(50);
    expect(await events(userId)).toHaveLength(0);

    await db
      .update(anticheatFile)
      .set({ lookupState: 'notFound', score: 1, band: 'low' })
      .where(eq(anticheatFile.sha512, sha512));
    await anticheatReportService.reevaluateFor([sha512]);
    expect(await scoreOf(userId)).toBe(10);
  });

  it('records the penalty without applying it in observe mode', async () => {
    await setMode('observe');
    await officialMod();
    const { sessionId, userId } = await session();
    await anticheatReportService.submit({
      sessionId,
      files: [file({ sha512: await scoredFile(60) })],
    });
    expect(await events(userId)).toMatchObject([
      { kind: 'modlistIncomplete', delta: -40, applied: false },
    ]);
    expect(await scoreOf(userId)).toBe(50);
  });
});

describe('player verdicts', () => {
  it('holds a player in the held band', async () => {
    const { sessionId, userId } = await session();
    await anticheatTrustService.adjust({ actor, userId, score: 20, reason: 'test' });
    const answer = await anticheatReportService.submit({ sessionId, files: [file()] });
    expect(answer.verdict.action).toBe('hold');
    expect(answer.verdict.reasons.map((r) => r.code)).toContain('playerHeld');
  });

  it('kicks a player at zero', async () => {
    const { sessionId, userId } = await session();
    await anticheatTrustService.adjust({ actor, userId, score: 0, reason: 'test' });
    const answer = await anticheatReportService.submit({ sessionId, files: [file()] });
    expect(answer.verdict.action).toBe('kick');
  });

  it('holds on a manual hold until it is cleared', async () => {
    const { sessionId, userId } = await session();
    const first = await anticheatReportService.submit({
      sessionId,
      files: [file({ kind: 'client', sha512: hash() })],
    });
    expect(first.verdict.action).toBe('allow');

    await anticheatTrustService.setHold({ actor, userId, hold: true, reason: 'check this one' });
    // The open session is evaluated again at once.
    const held = await anticheatReportService.current(sessionId);
    expect(held.verdict).toMatchObject({
      action: 'hold',
      reasons: [{ code: 'manualHold', action: 'hold' }],
    });
    const [row] = await db.select().from(anticheatPlayer).where(eq(anticheatPlayer.userId, userId));
    expect(row).toMatchObject({
      manualHold: true,
      holdReason: 'check this one',
      holdByUserId: admin,
    });

    await anticheatTrustService.setHold({ actor, userId, hold: false, reason: 'fine' });
    expect((await anticheatReportService.current(sessionId)).verdict.action).toBe('allow');
    expect((await events(userId)).map((e) => e.kind)).toEqual(['holdSet', 'holdCleared']);
  });

  it('lifts a player in the held band to the threshold when the hold is cleared', async () => {
    const { userId } = await session();
    await anticheatTrustService.adjust({ actor, userId, score: 10, reason: 'test' });
    await anticheatTrustService.setHold({ actor, userId, hold: true, reason: 'x' });
    await anticheatTrustService.setHold({ actor, userId, hold: false, reason: 'y' });
    expect(await scoreOf(userId)).toBe(30);
  });

  it('keeps an admin adjustment applied in observe mode', async () => {
    await setMode('observe');
    const { userId } = await session();
    await anticheatTrustService.adjust({ actor, userId, score: 80, reason: 'trusted' });
    expect(await scoreOf(userId)).toBe(80);
  });

  it('moves a middle file by the player adjustment', async () => {
    const sha512 = await scoredFile(60);
    const trusted = await session();
    await anticheatTrustService.adjust({ actor, userId: trusted.userId, score: 100, reason: 't' });
    const better = await anticheatReportService.submit({
      sessionId: trusted.sessionId,
      files: [file({ sha512 })],
    });
    expect(better.files[0]).toMatchObject({ score: 60, effectiveScore: 70 });

    const distrusted = await session();
    await anticheatTrustService.adjust({
      actor,
      userId: distrusted.userId,
      score: 10,
      reason: 't',
    });
    const worse = await anticheatReportService.submit({
      sessionId: distrusted.sessionId,
      files: [file({ sha512 })],
    });
    // 60 + (10 - 50) * 0.2 = 52.
    expect(worse.files[0]).toMatchObject({ score: 60, effectiveScore: 52 });
  });

  it('never lifts a mod found on neither platform', async () => {
    const sha512 = await scoredFile(30, false);
    const trusted = await session();
    await anticheatTrustService.adjust({ actor, userId: trusted.userId, score: 100, reason: 't' });
    const kept = await anticheatReportService.submit({
      sessionId: trusted.sessionId,
      files: [file({ sha512 })],
    });
    expect(kept.files[0]).toMatchObject({ score: 30, effectiveScore: 30 });

    const distrusted = await session();
    await anticheatTrustService.adjust({
      actor,
      userId: distrusted.userId,
      score: 0,
      reason: 't',
    });
    const lowered = await anticheatReportService.submit({
      sessionId: distrusted.sessionId,
      files: [file({ sha512 })],
    });
    expect(lowered.files[0]).toMatchObject({ score: 30, effectiveScore: 20 });
  });
});

describe('actions', () => {
  it('records what the server did, on an open or an ended session', async () => {
    const { sessionId, userId } = await session();
    const report = await anticheatReportService.submit({ sessionId, files: [file()] });
    await anticheatTrustService.recordAction({
      sessionId,
      reportId: report.reportId,
      action: 'refuse',
      reason: 'fileRefused',
      sha512: hash(),
    });
    await wardenSessionService.end({ sessionId, reason: 'quit' });
    await anticheatTrustService.recordAction({
      sessionId,
      reportId: null,
      action: 'ban',
      reason: 'fileBanned',
      sha512: null,
    });
    const rows = await db
      .select()
      .from(anticheatActionTaken)
      .where(and(eq(anticheatActionTaken.userId, userId)))
      .orderBy(anticheatActionTaken.id);
    expect(rows.map((r) => [r.action, r.reason, r.reportId !== null])).toEqual([
      ['refuse', 'fileRefused', true],
      ['ban', 'fileBanned', false],
    ]);
  });

  it('refuses an unknown session and ignores a report of another session', async () => {
    await expect(
      anticheatTrustService.recordAction({
        sessionId: randomUUID(),
        reportId: null,
        action: 'allow',
        reason: 'x',
        sha512: null,
      }),
    ).rejects.toMatchObject({ statusCode: 404, data: { problem: 'unknownSession' } });

    const a = await session();
    const b = await session();
    const reportOfB = await anticheatReportService.submit({
      sessionId: b.sessionId,
      files: [file()],
    });
    await anticheatTrustService.recordAction({
      sessionId: a.sessionId,
      reportId: reportOfB.reportId,
      action: 'allow',
      reason: 'x',
      sha512: null,
    });
    const [row] = await db
      .select()
      .from(anticheatActionTaken)
      .where(eq(anticheatActionTaken.userId, a.userId));
    expect(row!.reportId).toBeNull();
  });
});
