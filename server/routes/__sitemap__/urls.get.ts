import { eq } from 'drizzle-orm';
import { defineEventHandler } from 'nuxt/server';

import { db } from '~~/server/db';
import { changelogPost, event, partnerEvent } from '~~/server/db/schema';
import { flagService } from '~~/server/services/flags';

// The URLs @nuxtjs/sitemap can't find on its own: events, partner events and changelog posts. Not under /api, so
// it isn't in the API reference: only the sitemap module reads it.
export default defineEventHandler(async () => {
  const changelogOn = await flagService.isEnabled('changelog');
  const [events, partners, posts] = await Promise.all([
    db
      .select({ id: event.id, updatedAt: event.updatedAt })
      .from(event)
      .where(eq(event.hidden, false)),
    db.select({ slug: partnerEvent.slug }).from(partnerEvent),
    changelogOn
      ? db
          .select({ slug: changelogPost.slug, updatedAt: changelogPost.updatedAt })
          .from(changelogPost)
          .where(eq(changelogPost.status, 'published'))
      : [],
  ]);
  return [
    ...events.map((e) => ({ loc: `/events/${e.id}`, lastmod: e.updatedAt })),
    ...partners.map((p) => ({ loc: `/special/${p.slug}` })),
    ...posts.map((p) => ({ loc: `/minecraft/changelog/${p.slug}`, lastmod: p.updatedAt })),
  ];
});
