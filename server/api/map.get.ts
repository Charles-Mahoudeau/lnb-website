import { defineEventHandler } from 'nuxt/server';

import { mapService } from '~~/server/services/map';

import { isAdmin } from '#shared/utils/roles';

// Public: the map page shows without signing in. An admin gets the address while it's closed.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'map');
  const session = await getAuthSession(event);
  return mapService.getPublic({ admin: isAdmin(session?.user.role) });
});
