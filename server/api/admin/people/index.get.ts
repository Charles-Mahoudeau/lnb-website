import { defineEventHandler } from 'nuxt/server';

import { peopleService } from '~~/server/services/people';

import { adminPeopleQuery } from '#shared/schemas/admin';

export default defineEventHandler(async (event) => {
  const viewer = await requirePeople(event);
  return peopleService.list(viewer.role ?? null, parseQuery(event, adminPeopleQuery));
});
