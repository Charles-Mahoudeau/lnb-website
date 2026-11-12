import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { anticheatAlertService } from '~~/server/services/anticheat/alerts';

import { anticheatAlertParams } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, anticheatAlertParams);
  await anticheatAlertService.dismiss(id, admin.id);
  setResponseStatus(event, 204);
  return null;
});
