import { defineEventHandler } from 'nuxt/server';

import { ruleService } from '~~/server/services/rules';

import { ruleServerQuery } from '#shared/schemas/rules';

// The rules as plain text for the Minecraft server (a /rules command, a screen on first join).
export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'warden.serverApi');
  const { lang } = parseQuery(event, ruleServerQuery);
  return ruleService.listForServer(lang);
});
