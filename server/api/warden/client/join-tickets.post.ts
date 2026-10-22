import { createError, defineEventHandler } from 'nuxt/server';

import { wardenClientService } from '~~/server/services/warden/client';

import { wardenJoinTicketBody } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const client = await requireWardenClient(event);
  await requireFlag(event, 'warden.clientApi');
  const verdict = await wardenClientService.checkTicketRate(client.device.id);
  if (!verdict.allowed) {
    event.res.headers.set('Retry-After', String(verdict.retryAfterSeconds));
    throw createError({ status: 429, statusText: 'rateLimited', data: { problem: 'rateLimited' } });
  }
  return wardenClientService.joinTicket(client, await parseBody(event, wardenJoinTicketBody));
});
