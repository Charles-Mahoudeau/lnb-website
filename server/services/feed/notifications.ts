import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import { feedNotification, feedPost } from '~~/server/db/schema';

import { feedRightsService } from './rights';
import { DAY_MS, KEEP_DAYS, NOTIFICATIONS_PER_CALL } from './rules';
import { authorOf } from './views';

import type { FeedNotifications } from '#shared/schemas/feed';

// The notification queue (docs/feed-mod.md, section 9). The site works out every recipient when a
// post is created; the Minecraft server takes the rows, delivers them with the phone's
// notifications and acknowledges them, which deletes them. Rows of a deleted post went with it;
// rows older than 30 days are never returned, and the nightly purge deletes them.

/** The waiting notifications, oldest first, at most 100. */
async function list(now = new Date()): Promise<FeedNotifications> {
  const rows = await db
    .select({ notification: feedNotification, post: feedPost })
    .from(feedNotification)
    .innerJoin(feedPost, eq(feedPost.id, feedNotification.postId))
    .where(
      and(
        isNull(feedPost.deletedAt),
        gte(feedNotification.createdAt, new Date(now.getTime() - KEEP_DAYS * DAY_MS)),
      ),
    )
    .orderBy(asc(feedNotification.createdAt), asc(feedNotification.id))
    .limit(NOTIFICATIONS_PER_CALL + 1);
  const page = rows.slice(0, NOTIFICATIONS_PER_CALL);
  const userIds = page.flatMap((row) => [
    row.post.authorUserId,
    ...(row.notification.recipientUserId ? [row.notification.recipientUserId] : []),
  ]);
  const [people, accounts] = await Promise.all([
    feedRightsService.people(db, userIds),
    feedRightsService.accountsOf(db, userIds),
  ]);
  const uuidsOf = (userId: string) =>
    accounts.filter((account) => account.userId === userId).map((account) => account.uuid);
  return {
    items: page.map(({ notification, post }) => {
      const announcement = notification.kind === 'announcement';
      return {
        id: notification.id,
        kind: notification.kind,
        createdAt: notification.createdAt.toISOString(),
        players: announcement ? null : uuidsOf(notification.recipientUserId ?? ''),
        // The author's own accounts never get their announcement, anonymous or not. Only the
        // Minecraft server reads this list, and it never shows it to anyone.
        except: announcement ? uuidsOf(post.authorUserId) : [],
        post: {
          id: post.id,
          feed: post.feed,
          threadId: post.threadId,
          text: post.text,
          anonymous: post.anonymous,
          author: post.anonymous ? null : authorOf(post, people),
        },
      };
    }),
    more: rows.length > NOTIFICATIONS_PER_CALL,
  };
}

/** Deletes delivered notifications. Unknown IDs are ignored. */
async function ack(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.delete(feedNotification).where(inArray(feedNotification.id, ids));
}

export const feedNotificationService = { list, ack };
