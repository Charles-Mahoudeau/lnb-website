import { defineEventHandler } from 'nuxt/server';

import { wardenModerationService } from '~~/server/services/warden/moderation';

import { wardenAppealDecisionBody, wardenIdParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, wardenIdParams);
  const body = await parseBody(event, wardenAppealDecisionBody);
  return wardenModerationService.decideAppeal({ actorId: admin.id, appealId: id, ...body });
});
