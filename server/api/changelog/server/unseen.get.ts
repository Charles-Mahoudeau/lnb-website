import { defineEventHandler } from 'nuxt/server';

import { changelogService } from '~~/server/services/changelog';
import { serverPost } from '~~/server/services/changelog-views';

import { changelogServerUnseenQuery } from '#shared/schemas/changelog';

// The Minecraft server: the post to show a player on join, or null.
export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'changelog');
  const { player, lang } = parseQuery(event, changelogServerUnseenQuery);
  const post = await changelogService.unseenFor(player, lang ?? 'fr');
  return { post: post ? { ...serverPost(post), body: post.body } : null };
});
