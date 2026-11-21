import { defineEventHandler } from 'nuxt/server';

import { changelogService } from '~~/server/services/changelog';
import { detail } from '~~/server/services/changelog-views';

import { changelogIdParams } from '#shared/schemas/changelog';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, changelogIdParams);
  return detail(await changelogService.unpublish(id, admin.id));
});
