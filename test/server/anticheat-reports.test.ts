import { randomBytes, randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  anticheatAlert,
  anticheatFile,
  anticheatProject,
  anticheatReport,
  anticheatUsage,
  mod,
  user,
  wardenSession,
} from '~~/server/db/schema';
import { offlineUuid } from '~~/server/lib/minecraft';
import { anticheatReportService } from '~~/server/services/anticheat/reports';
import { anticheatSettingsService } from '~~/server/services/anticheat/settings';
import { wardenClientService } from '~~/server/services/warden/client';
import { wardenDeviceService } from '~~/server/services/warden/devices';
import { wardenSessionService } from '~~/server/services/warden/sessions';

import { anticheatReportBody } from '#shared/schemas/anticheat';
import type { AnticheatMode, AnticheatReportFileInput } from '#shared/schemas/anticheat';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const NONCE = 'N'.repeat(43);

let counter = 0;
const admin = `ac-admin-${String(Date.now())}`;

function hash() {
  return randomBytes(64).toString('hex');
}

function file(overrides: Partial<AnticheatReportFileInput> = {}): AnticheatReportFileInput {
  return { kind: 'mod', sha512: hash(), filename: 'some-mod.jar', ...overrides };
}

async function setMode(mode: AnticheatMode) {
  await anticheatSettingsService.update({ actorId: admin, mode });
}

/** A player in an open Warden session, through the real login. */
async function session() {
  const id = `ac-${String(++counter)}-${String(Date.now())}`;
  await db
    .insert(user)
    .values({ id, name: 'Anticheat Tester', email: `${id}@epitech.eu`, tenantId: EPITECH });
  const { device } = await db.transaction((tx) =>
    wardenDeviceService.create(tx, { userId: id, name: 'Laptop' }),
  );
  const client = {
    device: { id: device.id, name: device.name, expiresAt: device.expiresAt },
    user: { id, name: 'Anticheat Tester', tenantId: EPITECH, role: null },
  };
  const username = `Ac${String(Date.now() % 1000000)}x${String(counter)}`.slice(0, 16);
  const { ticket } = await wardenClientService.joinTicket(client, {
    nonce: NONCE,
    username,
    link: true,
  });
  const result = await wardenSessionService.login({
    ticket,
    nonce: NONCE,
    uuid: offlineUuid(username),
    username,
  });
  if (result.result !== 'allowed') throw new Error('expected the login to be allowed');
  return { userId: id, sessionId: result.sessionId };
}

/** A file the site already knows, with an optional project. */
async function knownFile(
  values: Partial<typeof anticheatFile.$inferInsert> = {},
  project?: Partial<typeof anticheatProject.$inferInsert>,
) {
  let projectId: string | null = null;
  if (project) {
    const [created] = await db
      .insert(anticheatProject)
      .values({ kind: 'mod', name: 'Known mod', ...project })
      .returning({ id: anticheatProject.id });
    projectId = created!.id;
  }
  const sha512 = hash();
  await db.insert(anticheatFile).values({
    sha512,
    kind: 'mod',
    filename: 'known.jar',
    lookupState: 'found',
    projectId,
    platformVersion: {
      modrinth: {
        versionId: 'v1',
        versionNumber: '1.0',
        loaders: ['neoforge'],
        publishedAt: '2024-01-01T00:00:00Z',
      },
    },
    ...values,
  });
  return sha512;
}

beforeEach(async () => {
  await db
    .insert(user)
    .values({ id: admin, name: 'Admin', email: `${admin}@epitech.eu`, tenantId: EPITECH })
    .onConflictDoNothing();
  await setMode('enforce');
});

afterAll(async () => {
  await setMode('observe');
});

describe('anticheat reports', () => {
  it('refuses an unknown session', async () => {
    await expect(
      anticheatReportService.submit({ sessionId: randomUUID(), files: [file()] }),
    ).rejects.toMatchObject({ statusCode: 404, data: { problem: 'unknownSession' } });
  });

  it('refuses an ended session', async () => {
    const { sessionId } = await session();
    await db
      .update(wardenSession)
      .set({ endedAt: new Date() })
      .where(eq(wardenSession.id, sessionId));
    await expect(
      anticheatReportService.submit({ sessionId, files: [file()] }),
    ).rejects.toMatchObject({ data: { problem: 'unknownSession' } });
  });

  it('stores nothing when the mode is off', async () => {
    await setMode('off');
    const { sessionId, userId } = await session();
    const answer = await anticheatReportService.submit({ sessionId, files: [file()] });
    expect(answer).toEqual({
      reportId: null,
      mode: 'off',
      verdict: { action: 'allow', reasons: [] },
      files: [],
      pending: 0,
    });
    expect(
      await db.select().from(anticheatReport).where(eq(anticheatReport.userId, userId)),
    ).toEqual([]);
    expect(await db.select().from(anticheatUsage).where(eq(anticheatUsage.userId, userId))).toEqual(
      [],
    );
  });

  it('keeps an unknown hash pending, and allows it for now', async () => {
    const { sessionId } = await session();
    const unknown = file({ filename: 'mystery.jar' });
    const answer = await anticheatReportService.submit({ sessionId, files: [unknown] });
    expect(answer.pending).toBe(1);
    expect(answer.files[0]).toMatchObject({
      sha512: unknown.sha512,
      state: 'pending',
      score: null,
      status: 'pending',
      action: 'allow',
    });
    expect(answer.verdict.action).toBe('allow');
  });

  it('ignores client entries', async () => {
    const { sessionId } = await session();
    const answer = await anticheatReportService.submit({
      sessionId,
      files: [file({ kind: 'client', filename: 'minecraft.jar' })],
    });
    expect(answer.files[0]).toMatchObject({ state: 'ignored', score: null, status: null });
    expect(answer.pending).toBe(0);
  });

  it('bans for a banned project in enforce mode', async () => {
    const sha512 = await knownFile({}, { modrinthId: `mr-${randomUUID()}`, decision: 'banned' });
    const { sessionId } = await session();
    const answer = await anticheatReportService.submit({ sessionId, files: [file({ sha512 })] });
    expect(answer.files[0]).toMatchObject({
      score: 0,
      band: 'banned',
      status: 'banned',
      action: 'ban',
    });
    expect(answer.verdict).toMatchObject({
      action: 'ban',
      reasons: [{ code: 'fileBanned', sha512 }],
    });
    expect(answer.verdict.wouldBe).toBeUndefined();
  });

  it('only says what it would do in observe mode', async () => {
    await setMode('observe');
    const sha512 = await knownFile({}, { modrinthId: `mr-${randomUUID()}`, decision: 'banned' });
    const { sessionId, userId } = await session();
    const answer = await anticheatReportService.submit({ sessionId, files: [file({ sha512 })] });
    expect(answer.mode).toBe('observe');
    expect(answer.verdict).toMatchObject({ action: 'allow', wouldBe: 'ban' });
    expect(answer.files[0]?.action).toBe('ban');
    // Everything is logged all the same.
    const alerts = await db.select().from(anticheatAlert).where(eq(anticheatAlert.userId, userId));
    expect(alerts.map((a) => a.kind)).toEqual(['bannedFileSeen']);
  });

  it('gives 100 to an approved hash, and a ban wins over it', async () => {
    const approved = await knownFile({ decision: 'approved' });
    const both = await knownFile(
      { decision: 'approved' },
      { modrinthId: `mr-${randomUUID()}`, decision: 'banned' },
    );
    const { sessionId } = await session();
    const answer = await anticheatReportService.submit({
      sessionId,
      files: [file({ sha512: approved }), file({ sha512: both })],
    });
    const byHash = new Map(answer.files.map((f) => [f.sha512, f]));
    expect(byHash.get(approved)).toMatchObject({
      score: 100,
      effectiveScore: 100,
      status: 'approved',
      action: 'allow',
    });
    expect(byHash.get(both)).toMatchObject({ score: 0, status: 'banned' });
  });

  it('gives 100 to a project of the official mod list', async () => {
    const sourceId = `mr-${randomUUID()}`;
    await db.insert(mod).values({
      list: 'official',
      source: 'modrinth',
      sourceId,
      name: 'Official',
      pageUrl: 'https://modrinth.com/mod/official',
    });
    const sha512 = await knownFile({}, { modrinthId: sourceId });
    const { sessionId } = await session();
    const first = await anticheatReportService.submit({ sessionId, files: [file({ sha512 })] });
    expect(first.files[0]).toMatchObject({ score: 100, status: 'approved' });
  });

  it('scores a known file from its stored platform data', async () => {
    const sha512 = await knownFile(
      { declared: { version: '1.0', loader: 'neoforge' } },
      {
        modrinthId: `mr-${randomUUID()}`,
        modrinth: {
          id: 'x',
          slug: 'x',
          title: 'X',
          projectType: 'mod',
          status: 'approved',
          downloads: 50000,
          publishedAt: '2023-01-01T00:00:00Z',
          serverSide: 'required',
          fetchedAt: '2024-01-01T00:00:00Z',
        },
      },
    );
    const { sessionId } = await session();
    const answer = await anticheatReportService.submit({
      sessionId,
      files: [file({ sha512, version: '1.0', loader: 'neoforge' })],
    });
    const [row] = await db.select().from(anticheatFile).where(eq(anticheatFile.sha512, sha512));
    expect(row?.breakdown?.path).toBe('computed');
    expect(answer.files[0]?.score).toBe(row?.score);
    expect(answer.files[0]?.score).toBeGreaterThan(75);
  });

  it('counts one session for two reports in the same session', async () => {
    const { sessionId, userId } = await session();
    const shared = file();
    await anticheatReportService.submit({ sessionId, files: [shared] });
    await anticheatReportService.submit({ sessionId, files: [shared, file()] });
    const [usage] = await db
      .select()
      .from(anticheatUsage)
      .where(and(eq(anticheatUsage.userId, userId), eq(anticheatUsage.sha512, shared.sha512)));
    expect(usage?.sessionCount).toBe(1);

    const next = await session();
    // Another session of the same account counts again.
    await db.update(wardenSession).set({ userId }).where(eq(wardenSession.id, next.sessionId));
    await anticheatReportService.submit({ sessionId: next.sessionId, files: [shared] });
    const [again] = await db
      .select()
      .from(anticheatUsage)
      .where(and(eq(anticheatUsage.userId, userId), eq(anticheatUsage.sha512, shared.sha512)));
    expect(again?.sessionCount).toBe(2);
  });

  it('numbers the reports of a session', async () => {
    const { sessionId } = await session();
    await anticheatReportService.submit({ sessionId, files: [file()] });
    await anticheatReportService.submit({ sessionId, files: [file()] });
    const reports = await db
      .select()
      .from(anticheatReport)
      .where(eq(anticheatReport.sessionId, sessionId));
    expect(reports.map((r) => r.seq).sort()).toEqual([1, 2]);
  });

  it('serves the latest report of a session again', async () => {
    const { sessionId } = await session();
    await expect(anticheatReportService.current(sessionId)).rejects.toMatchObject({
      data: { problem: 'noReport' },
    });
    await anticheatReportService.submit({ sessionId, files: [file()] });
    const sha512 = await knownFile({ decision: 'approved' });
    const second = await anticheatReportService.submit({ sessionId, files: [file({ sha512 })] });
    expect(await anticheatReportService.current(sessionId)).toEqual(second);
    await expect(anticheatReportService.current(randomUUID())).rejects.toMatchObject({
      data: { problem: 'unknownSession' },
    });
  });

  it('raises an alert when two reports disagree about a resource pack', async () => {
    const pack = file({
      kind: 'resourcepack',
      filename: 'pack.zip',
      facts: { coreShaders: false, alteredTextures: false },
    });
    const first = await session();
    await anticheatReportService.submit({ sessionId: first.sessionId, files: [pack] });
    const second = await session();
    await anticheatReportService.submit({
      sessionId: second.sessionId,
      files: [{ ...pack, facts: { coreShaders: true, alteredTextures: false } }],
    });
    const [row] = await db
      .select()
      .from(anticheatFile)
      .where(eq(anticheatFile.sha512, pack.sha512));
    expect(row?.factsDisputed).toBe(true);
    expect(row?.facts).toEqual({ coreShaders: false, alteredTextures: false });
    const alerts = await db
      .select()
      .from(anticheatAlert)
      .where(eq(anticheatAlert.sha512, pack.sha512));
    expect(alerts.map((a) => [a.kind, a.userId])).toEqual([['factsDisputed', second.userId]]);
  });

  it('refuses more than 1,000 files, and duplicates', () => {
    const files = Array.from({ length: 1001 }, () => file());
    expect(anticheatReportBody.safeParse({ sessionId: randomUUID(), files }).success).toBe(false);
    const one = file();
    expect(
      anticheatReportBody.safeParse({ sessionId: randomUUID(), files: [one, one] }).success,
    ).toBe(false);
    expect(
      anticheatReportBody.safeParse({ sessionId: randomUUID(), files: files.slice(0, 1000) })
        .success,
    ).toBe(true);
  });
});
