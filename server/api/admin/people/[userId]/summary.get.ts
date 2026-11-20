import { createError, defineEventHandler } from 'nuxt/server';

import { peopleService } from '~~/server/services/people';

import { adminUserParams } from '#shared/schemas/admin';

export default defineEventHandler(async (event) => {
  const viewer = await requirePeople(event);
  const { userId } = parseParams(event, adminUserParams);
  const summary = await peopleService.summary(viewer.role ?? null, userId);
  if (!summary) {
    throw createError({ status: 404, statusText: 'notFound', data: { problem: 'notFound' } });
  }
  return summary;
});
