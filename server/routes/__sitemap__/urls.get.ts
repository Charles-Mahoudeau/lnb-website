import { eq } from 'drizzle-orm';
import { defineEventHandler } from 'nuxt/server';

import { db } from '~~/server/db';
import { event, partnerEvent } from '~~/server/db/schema';

// The URLs @nuxtjs/sitemap can't find on its own: events and partner events. Not under /api, so
// it isn't in the API reference: only the sitemap module reads it.
export default defineEventHandler(async () => {
  const [events, partners] = await Promise.all([
    db
      .select({ id: event.id, updatedAt: event.updatedAt })
      .from(event)
      .where(eq(event.hidden, false)),
    db.select({ slug: partnerEvent.slug }).from(partnerEvent),
  ]);
  return [
    ...events.map((e) => ({ loc: `/events/${e.id}`, lastmod: e.updatedAt })),
    ...partners.map((p) => ({ loc: `/special/${p.slug}` })),
  ];
});
