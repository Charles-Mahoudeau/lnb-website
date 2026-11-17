import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  playtimeExemption,
  playtimeGrant,
  playtimeLedger,
  playtimeNotice,
  user,
  wardenSession,
} from '~~/server/db/schema';
import { playtimePruneService } from '~~/server/services/playtime/prune';

import { parisInstant } from '#shared/utils/paris-time';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
// A Wednesday. Its Monday is 2031-12-01, so the cut-off is 26 weeks earlier: 2031-06-02.
const NOW = parisInstant('2031-12-03', 10 * 60);

let counter = 0;
async function setup() {
  const id = `prune-${String(++counter)}-${String(Date.now())}`;
  await db.insert(user).values({ id, name: 'Prune', email: `${id}@epitech.eu`, tenantId: EPITECH });
  const uuid = crypto.randomUUID();
  await db
    .insert(minecraftAccount)
    .values({ uuid, userId: id, username: `P${String(counter)}x${String(Date.now() % 10000)}` });
  const [session] = await db
    .insert(wardenSession)
    .values({
      minecraftUuid: uuid,
      userId: id,
      startedAt: new Date(NOW - 7200_000),
      lastHeartbeatAt: new Date(NOW - 3600_000),
      endedAt: new Date(Date.now() - 2 * 86_400_000),
    })
    .returning({ id: wardenSession.id });
  return { id, uuid, sessionId: session!.id };
}

describe('the nightly playtime clean-up', () => {
  it('keeps 26 weeks of ledger and drops the warnings of ended sessions', async () => {
    const p = await setup();
    const row = (week: string) => ({
      sessionId: p.sessionId,
      weekStart: week,
      userId: p.id,
      minecraftUuid: p.uuid,
      countedSeconds: 60,
      countedUntil: new Date(NOW),
    });
    await db
      .insert(playtimeLedger)
      .values([row('2031-06-02'), row('2031-05-26'), row('2031-12-01')]);
    await db.insert(playtimeNotice).values({ sessionId: p.sessionId, kind: 'w30' });

    const done = await playtimePruneService.prune(NOW);
    expect(done.ledger).toBeGreaterThanOrEqual(1);
    expect(done.notices).toBeGreaterThanOrEqual(1);
    const weeks = (
      await db.select().from(playtimeLedger).where(eq(playtimeLedger.userId, p.id))
    ).map((r) => r.weekStart);
    expect(weeks.sort()).toEqual(['2031-06-02', '2031-12-01']);
    expect(
      await db.select().from(playtimeNotice).where(eq(playtimeNotice.sessionId, p.sessionId)),
    ).toEqual([]);
  });

  it('keeps the warnings of a session still open', async () => {
    const p = await setup();
    await db.update(wardenSession).set({ endedAt: null }).where(eq(wardenSession.id, p.sessionId));
    await db.insert(playtimeNotice).values({ sessionId: p.sessionId, kind: 'w10' });
    await playtimePruneService.prune(NOW);
    expect(
      await db.select().from(playtimeNotice).where(eq(playtimeNotice.sessionId, p.sessionId)),
    ).toHaveLength(1);
  });

  it('is gone with the account: ledger, warnings, grants and exemptions', async () => {
    const p = await setup();
    await db.insert(playtimeLedger).values({
      sessionId: p.sessionId,
      weekStart: '2031-12-01',
      userId: p.id,
      minecraftUuid: p.uuid,
      countedUntil: new Date(NOW),
    });
    await db.insert(playtimeNotice).values({ sessionId: p.sessionId, kind: 'w5' });
    await db
      .insert(playtimeGrant)
      .values({ userId: p.id, weekStart: '2031-12-01', seconds: 600, reason: 'x' });
    await db.insert(playtimeExemption).values([
      { userId: p.id, reason: 'x' },
      { minecraftUuid: p.uuid, reason: 'y' },
    ]);

    await db.delete(user).where(eq(user.id, p.id));

    expect(await db.select().from(playtimeLedger).where(eq(playtimeLedger.userId, p.id))).toEqual(
      [],
    );
    expect(
      await db.select().from(playtimeNotice).where(eq(playtimeNotice.sessionId, p.sessionId)),
    ).toEqual([]);
    expect(await db.select().from(playtimeGrant).where(eq(playtimeGrant.userId, p.id))).toEqual([]);
    expect(
      await db.select().from(playtimeExemption).where(eq(playtimeExemption.userId, p.id)),
    ).toEqual([]);
    expect(
      await db.select().from(playtimeExemption).where(eq(playtimeExemption.minecraftUuid, p.uuid)),
    ).toEqual([]);
  });
});
