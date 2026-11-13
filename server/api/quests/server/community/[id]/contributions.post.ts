import { defineEventHandler } from 'nuxt/server';

import { questServerService } from '~~/server/services/quests/server';

import { questContributionBody, questUuidParams } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.quests');
  const { id } = parseParams(event, questUuidParams);
  return questServerService.contribute(id, await parseBody(event, questContributionBody));
});
