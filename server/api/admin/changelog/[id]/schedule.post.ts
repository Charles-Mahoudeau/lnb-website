import { defineEventHandler } from 'nuxt/server';

import { changelogService } from '~~/server/services/changelog';
import { detail } from '~~/server/services/changelog-views';

import { changelogIdParams, changelogScheduleBody } from '#shared/schemas/changelog';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, changelogIdParams);
  const { at } = await parseBody(event, changelogScheduleBody);
  return detail(await changelogService.schedule(id, new Date(at), admin.id));
});
