import { defineEventHandler } from 'nuxt/server';

import { eventPublicService } from '~~/server/services/events/public';

import { eventIdParams } from '#shared/schemas/events';
import { isEventsManager } from '#shared/utils/roles';

export default defineEventHandler(async (event) => {
  await requireFlag(event, 'events');
  const { id } = parseParams(event, eventIdParams);
  const viewer = (await getAuthSession(event))?.user;
  return eventPublicService.get(id, {
    userId: viewer?.id ?? null,
    tenantId: viewer?.tenantId ?? null,
    canSeeDrafts: isEventsManager(viewer?.role),
  });
});
