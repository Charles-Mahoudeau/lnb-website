import { lt } from 'drizzle-orm';

import { db } from '~~/server/db';
import { feedNotification, feedPost } from '~~/server/db/schema';

import { DAY_MS, KEEP_DAYS } from './rules';

// The nightly purge (docs/feed.md, "Nightly purge"): posts and replies deleted more than 30 days
// ago (their likes, seen rows and notifications go by cascade, and a thread's replies with its
// main post), and notifications nobody took in 30 days. The task records the counts.

async function purge(now = new Date()): Promise<{ posts: number; notifications: number }> {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * DAY_MS);
  return db.transaction(async (tx) => {
    const posts = await tx
      .delete(feedPost)
      .where(lt(feedPost.deletedAt, cutoff))
      .returning({ id: feedPost.id });
    const notifications = await tx
      .delete(feedNotification)
      .where(lt(feedNotification.createdAt, cutoff))
      .returning({ id: feedNotification.id });
    return { posts: posts.length, notifications: notifications.length };
  });
}

export const feedPurgeService = { purge };
