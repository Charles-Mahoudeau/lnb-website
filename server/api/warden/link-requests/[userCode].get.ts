import { defineEventHandler } from 'nuxt/server';

import { wardenDeviceLinkService } from '~~/server/services/warden/device-links';
import { refuse } from '~~/server/services/warden/shared';

import { wardenUserCodeParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'warden.linking');
  const { userCode } = parseParams(event, wardenUserCodeParams);
  const preview = await wardenDeviceLinkService.preview({ actorId: user.id, userCode });
  if (!preview) refuse(404, 'notFound');
  return preview;
});
