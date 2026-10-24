import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  adminAudit,
  event,
  eventRoom,
  eventType,
  poster,
  shortLink,
  user,
} from '~~/server/db/schema';
import { posterService } from '~~/server/services/posters';

import type { PosterBody } from '#shared/schemas/posters';
import { allColors } from '#shared/utils/posters';

const MANAGER = 'poster-manager';
const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
let eventId: string;

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= 'x'.repeat(32);
  process.env.BETTER_AUTH_URL = 'https://lnb.example.com';
  process.env.MICROSOFT_CLIENT_ID ??= 'id';
  process.env.MICROSOFT_CLIENT_SECRET ??= 'secret';
  process.env.AUTH_ALLOWED_TENANTS ??= EPITECH;
  await db
    .insert(user)
    .values({ id: MANAGER, name: 'Poster Manager', email: 'poster@epitech.eu', tenantId: EPITECH })
    .onConflictDoNothing();
  const [room] = await db
    .insert(eventRoom)
    .values({ name: 'Poster room', details: 'Nantes' })
    .returning();
  const [type] = await db
    .insert(eventType)
    .values({ nameEn: 'Poster tournament', nameFr: 'Tournoi affiche', icon: 'i-lucide-swords' })
    .returning();
  const [row] = await db
    .insert(event)
    .values({
      name: 'Smash Bros',
      description: 'Bring a controller.',
      roomId: room!.id,
      typeId: type!.id,
      schools: [EPITECH],
      startsAt: new Date('2026-12-17T18:30:00Z'),
      endsAt: new Date('2026-12-17T23:00:00Z'),
    })
    .returning();
  eventId = row!.id;
});

function body(patch: Partial<PosterBody> = {}): PosterBody {
  return {
    name: 'Smash poster',
    eventId,
    template: 'banner',
    treatment: null,
    locale: 'fr',
    overrides: {},
    content: {
      sticker: ['', '', ''],
      footer: '',
      qrEnabled: true,
      qrLabel: null,
      photos: [],
      colors: allColors('violet'),
    },
    qrUrl: null,
    ...patch,
  };
}

async function linkOf(posterId: string) {
  const [row] = await db.select().from(poster).where(eq(poster.id, posterId));
  const [link] = row!.shortLinkId
    ? await db.select().from(shortLink).where(eq(shortLink.id, row!.shortLinkId))
    : [];
  return link;
}

describe('posters', () => {
  it('follows its event and makes a short link to the event page', async () => {
    const { id } = await posterService.create({ actorId: MANAGER, body: body() });
    const view = await posterService.get(id);
    expect(view.event).toMatchObject({ id: eventId, draft: true, cancelled: false });
    expect(view.event!.source).toMatchObject({
      name: 'Smash Bros',
      typeNameFr: 'Tournoi affiche',
      room: { name: 'Poster room', details: 'Nantes' },
    });
    expect(view.qr).toMatchObject({
      destinationUrl: `https://lnb.example.com/events/${eventId}`,
      followsEvent: true,
      clicks: 0,
    });
    expect(view.qr!.url).toBe(`https://lnb.example.com/go/${view.qr!.shortId}`);
    const link = await linkOf(id);
    expect(link).toMatchObject({
      name: 'Poster: Smash poster',
      access: 'any',
      recordClicks: false,
    });
    expect(view.updatedBy).toBe('Poster Manager');
  });

  it('makes no link while the QR code is off', async () => {
    const content = { ...body().content, qrEnabled: false };
    const { id } = await posterService.create({ actorId: MANAGER, body: body({ content }) });
    expect((await posterService.get(id)).qr).toBeNull();
    // Turned on later, it gets one.
    await posterService.update({ actorId: MANAGER, id, body: body() });
    expect((await posterService.get(id)).qr?.followsEvent).toBe(true);
  });

  it('moves the link when the QR address changes, and keeps it', async () => {
    const { id } = await posterService.create({ actorId: MANAGER, body: body() });
    const before = await linkOf(id);
    await posterService.update({
      actorId: MANAGER,
      id,
      body: body({ qrUrl: 'https://example.com/signup' }),
    });
    const after = await linkOf(id);
    expect(after!.id).toBe(before!.id);
    expect(after!.destinationUrl).toBe('https://example.com/signup');
    expect((await posterService.get(id)).qr?.followsEvent).toBe(false);
  });

  it('needs an address for the QR code of a standalone poster', async () => {
    await expect(
      posterService.create({ actorId: MANAGER, body: body({ eventId: null }) }),
    ).rejects.toMatchObject({ data: { problem: 'qrUrlNeeded' } });
    const content = { ...body().content, qrEnabled: false };
    const { id } = await posterService.create({
      actorId: MANAGER,
      body: body({ eventId: null, content, overrides: { title: 'Soirée jeux' } }),
    });
    const view = await posterService.get(id);
    expect(view.event).toBeNull();
    expect(view.overrides).toEqual({ title: 'Soirée jeux' });
  });

  it('refuses an unknown event', async () => {
    await expect(
      posterService.create({
        actorId: MANAGER,
        body: body({ eventId: '00000000-0000-4000-8000-000000000000' }),
      }),
    ).rejects.toMatchObject({ data: { problem: 'eventNotFound' } });
  });

  it('keeps a treatment only on Art title', async () => {
    const { id } = await posterService.create({
      actorId: MANAGER,
      body: body({ treatment: 'duotone' }),
    });
    expect((await posterService.get(id)).treatment).toBeNull();
    await posterService.update({
      actorId: MANAGER,
      id,
      body: body({ template: 'artTitle', treatment: 'duotone' }),
    });
    expect((await posterService.get(id)).treatment).toBe('duotone');
  });

  it('shares the link with a duplicate, and keeps it when deleted', async () => {
    const { id } = await posterService.create({ actorId: MANAGER, body: body() });
    const copy = await posterService.duplicate({ actorId: MANAGER, id, body: { name: 'Copy' } });
    const [original, duplicate] = await Promise.all([linkOf(id), linkOf(copy.id)]);
    expect(duplicate!.id).toBe(original!.id);
    expect((await posterService.get(copy.id)).name).toBe('Copy');

    await posterService.remove({ actorId: MANAGER, id });
    await expect(posterService.get(id)).rejects.toMatchObject({
      data: { problem: 'posterNotFound' },
    });
    expect(await linkOf(copy.id)).toBeDefined();
    const audit = await db.select().from(adminAudit).where(eq(adminAudit.action, 'poster.delete'));
    expect(audit.some((a) => (a.data as { id?: string }).id === id)).toBe(true);
  });

  it('lists every poster', async () => {
    const items = await posterService.list();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((p) => typeof p.updatedAt === 'string')).toBe(true);
  });
});
