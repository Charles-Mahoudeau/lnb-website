import { defineEventHandler } from 'nuxt/server';

import { db } from '~~/server/db';
import { wardenModerationService } from '~~/server/services/warden/moderation';

import { wardenServerBanBody, wardenUuidParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  const { uuid } = parseParams(event, wardenUuidParams);
  const { issuer, ...body } = await parseBody(event, wardenServerBanBody);
  const actor = await wardenModerationService.serverActor(db, issuer);
  const userId = await wardenModerationService.ownerOf(db, uuid);
  return wardenModerationService.ban({ userId, body, actor, minecraftUuid: uuid });
});
