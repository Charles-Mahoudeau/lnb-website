import { defineEventHandler } from 'nuxt/server';

import { wardenModerationService } from '~~/server/services/warden/moderation';

import { wardenNoteBody, wardenUserParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { userId } = parseParams(event, wardenUserParams);
  const body = await parseBody(event, wardenNoteBody);
  return wardenModerationService.addNote({
    userId,
    body,
    actor: { source: 'web', userId: admin.id },
  });
});
