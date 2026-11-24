import { defineEventHandler } from 'nuxt/server';

import { feedAdminService } from '~~/server/services/feed/admin';

import { feedIdParams } from '#shared/schemas/feed';

// One row of the admin's Feed table for its drawer, with its whole thread, deleted replies
// included. Moderators, never behind a flag.
export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { id } = parseParams(event, feedIdParams);
  return feedAdminService.detail(id);
});
