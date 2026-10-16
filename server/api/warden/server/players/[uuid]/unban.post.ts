import { defineEventHandler } from 'nuxt/server';

import { db } from '~~/server/db';
import { wardenModerationService } from '~~/server/services/warden/moderation';

import { wardenServerUnbanBody, wardenUuidParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'warden.serverApi');
  const { uuid } = parseParams(event, wardenUuidParams);
  const { issuer, reason } = await parseBody(event, wardenServerUnbanBody);
  const actor = await wardenModerationService.serverActor(db, issuer);
  const userId = await wardenModerationService.ownerOf(db, uuid);
  return wardenModerationService.unban({ userId, reason, actor });
});
