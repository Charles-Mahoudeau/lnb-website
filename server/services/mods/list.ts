import { and, count, eq, isNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import type { Db } from '~~/server/db';
import { mod, modVote } from '~~/server/db/schema';
import { wardenModerationService } from '~~/server/services/warden/moderation';
import { shortName } from '~~/server/services/warden/rules';

import { suggestionsLeft } from './rules';
import { modSettingsService } from './settings';
import { iconUrl, refuse } from './shared';
import { modsWithVotes, voteCounts } from './views';
import type { ModRow } from './views';

import type { ModListPage, ModView, ModVoteResult } from '#shared/schemas/mods';

// The public page: both tabs, the viewer's votes, and voting.

function toView(row: ModRow, viewerId: string | undefined, votes: Map<number, number>): ModView {
  return {
    id: row.id,
    list: row.list,
    source: row.source,
    name: row.name,
    summary: row.summary,
    pageUrl: row.pageUrl,
    iconUrl: iconUrl(row),
    score: row.up - row.down,
    up: row.up,
    down: row.down,
    suggested: row.list === 'suggestion' || row.promotedAt !== null,
    proposerName: row.proposerName ? shortName(row.proposerName) : null,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    myVote: (votes.get(row.id) ?? 0) as ModView['myVote'],
    mine: viewerId !== undefined && row.proposerUserId === viewerId,
  };
}

/** How many suggestions an account has in the list, visible or removed. */
export async function suggestionsUsed(userId: string, dbx: Db = db): Promise<number> {
  const [row] = await dbx
    .select({ n: count() })
    .from(mod)
    .where(and(eq(mod.proposerUserId, userId), eq(mod.list, 'suggestion')));
  return row?.n ?? 0;
}

/** Everything the page shows. `viewerId` is undefined when signed out. */
async function page(viewerId: string | undefined): Promise<ModListPage> {
  const [settings, rows, myVotes] = await Promise.all([
    modSettingsService.get(),
    modsWithVotes(eq(mod.status, 'visible')),
    viewerId
      ? db
          .select({ modId: modVote.modId, value: modVote.value })
          .from(modVote)
          .where(eq(modVote.userId, viewerId))
      : Promise.resolve([]),
  ]);
  const votes = new Map(myVotes.map((vote) => [vote.modId, vote.value]));
  const views = rows.map((row) => toView(row, viewerId, votes));

  let me: ModListPage['me'] = null;
  if (viewerId) {
    const [used, ban, removed] = await Promise.all([
      suggestionsUsed(viewerId),
      wardenModerationService.activeBan(viewerId),
      db
        .select({
          id: mod.id,
          name: mod.name,
          reason: mod.removedReason,
          removedAt: mod.removedAt,
        })
        .from(mod)
        .where(
          and(
            eq(mod.proposerUserId, viewerId),
            eq(mod.status, 'removed'),
            isNull(mod.removalSeenAt),
          ),
        ),
    ]);
    me = {
      suggestionsLeft: suggestionsLeft(settings.maxSuggestions, used),
      maxSuggestions: settings.maxSuggestions,
      banned: Boolean(ban),
      removed: removed.map((notice) => ({
        id: notice.id,
        name: notice.name,
        reason: notice.reason ?? '',
        removedAt: (notice.removedAt ?? new Date()).toISOString(),
      })),
    };
  }

  return {
    settings: { open: settings.open, gameVersion: settings.gameVersion, loader: settings.loader },
    official: views.filter((view) => view.list === 'official'),
    suggestions: views.filter((view) => view.list === 'suggestion'),
    me,
  };
}

/** Sets, changes or clears (0) the actor's vote on a visible mod that isn't their own. */
async function vote(input: {
  actorId: string;
  modId: number;
  value: -1 | 0 | 1;
}): Promise<ModVoteResult> {
  const settings = await modSettingsService.get();
  if (!settings.open) refuse(409, 'closed');
  if (await wardenModerationService.activeBan(input.actorId)) refuse(403, 'banned');

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ status: mod.status, proposerUserId: mod.proposerUserId })
      .from(mod)
      .where(eq(mod.id, input.modId));
    if (target?.status !== 'visible') refuse(404, 'notFound');
    if (target.proposerUserId === input.actorId) refuse(403, 'ownMod');

    if (input.value === 0) {
      await tx
        .delete(modVote)
        .where(and(eq(modVote.modId, input.modId), eq(modVote.userId, input.actorId)));
    } else {
      await tx
        .insert(modVote)
        .values({ modId: input.modId, userId: input.actorId, value: input.value })
        .onConflictDoUpdate({
          target: [modVote.modId, modVote.userId],
          set: { value: input.value, updatedAt: new Date() },
        });
    }
    const counts = await voteCounts(input.modId, tx);
    return { ...counts, score: counts.up - counts.down, myVote: input.value };
  });
}

/** The storage key of a mod's icon, for the icon route. */
async function iconKey(modId: number): Promise<string | null> {
  const [row] = await db.select({ iconKey: mod.iconKey }).from(mod).where(eq(mod.id, modId));
  return row?.iconKey ?? null;
}

export const modListService = { page, vote, iconKey };
