import { defineEventHandler } from 'nuxt/server';

import { mapService } from '~~/server/services/map';

import { isAdmin } from '#shared/utils/roles';

// Public, like the map page. Nothing to ask while the map is closed to this visitor.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'map');
  const session = await getAuthSession(event);
  return mapService.getStatus({ admin: isAdmin(session?.user.role) });
});
