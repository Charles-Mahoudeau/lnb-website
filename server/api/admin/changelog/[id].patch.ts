import { defineEventHandler } from 'nuxt/server';

import { changelogService } from '~~/server/services/changelog';
import { detail } from '~~/server/services/changelog-views';

import { changelogIdParams, changelogPatchBody } from '#shared/schemas/changelog';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, changelogIdParams);
  const patch = await parseBody(event, changelogPatchBody);
  return detail(await changelogService.update(id, patch, admin.id));
});
