import { defineEventHandler } from 'nuxt/server';

import { partnerTeamService } from '~~/server/services/partner-teams';

import { partnerGameParams } from '#shared/schemas/partner-events';

// A game's teams and the students looking for one. Visitors only get counts.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'partnerEvents');
  const session = await getAuthSession(event);
  const { slug, game } = parseParams(event, partnerGameParams);
  return partnerTeamService.view({ slug, game, userId: session?.user.id ?? null });
});
