import { defineEventHandler } from 'nuxt/server';

import { db } from '~~/server/db';
import { wardenModerationService } from '~~/server/services/warden/moderation';

import { wardenServerWarningBody, wardenUuidParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'warden.serverApi');
  const { uuid } = parseParams(event, wardenUuidParams);
  const { issuer, body } = await parseBody(event, wardenServerWarningBody);
  const actor = await wardenModerationService.serverActor(db, issuer);
  const userId = await wardenModerationService.ownerOf(db, uuid);
  return wardenModerationService.addNote({ userId, body: { kind: 'warning', body }, actor });
});
