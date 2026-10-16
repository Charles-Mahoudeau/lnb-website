import { defineEventHandler } from 'nuxt/server';

import { requireWardenSchool, wardenPlayerService } from '~~/server/services/warden/players';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'warden.linking');
  requireWardenSchool(user.tenantId);
  const { serverUrl } = await wardenPlayerService.rotateToken({
    userId: user.id,
    actor: { source: 'web', userId: user.id },
  });
  return { serverUrl };
});
