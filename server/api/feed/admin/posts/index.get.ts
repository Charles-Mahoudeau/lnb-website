import { defineEventHandler } from 'nuxt/server';

import { feedAdminService } from '~~/server/services/feed/admin';

import { feedAdminListQuery } from '#shared/schemas/feed';

// The admin's Feed table: main posts and replies, live and deleted, authors always shown, with the
// filters' summary. Moderators, never behind a flag.
export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const query = parseQuery(event, feedAdminListQuery);
  return feedAdminService.list(query);
});
