import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { changelogService } from '~~/server/services/changelog';
import { detail } from '~~/server/services/changelog-views';

import { changelogCreateBody } from '#shared/schemas/changelog';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const body = await parseBody(event, changelogCreateBody);
  const post = await changelogService.create(body, admin.id);
  setResponseStatus(event, 201);
  return detail(post);
});
