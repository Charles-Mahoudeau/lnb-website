import { createHash } from 'node:crypto';

import { asc, eq, sql } from 'drizzle-orm';
import { useStorage } from 'nitropack/runtime';
import { createError } from 'nuxt/server';
import sharp from 'sharp';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import { partner, partnerSetting } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';
import { flagService } from '~~/server/services/flags';

import { PARTNER_KINDS } from '#shared/schemas/partners';
import type {
  PartnerAdminItem,
  PartnerAdminView,
  PartnerBody,
  PartnerKind,
  PartnerLogoView,
  PartnerPatchBody,
  PartnerProblem,
  PartnerPublicView,
} from '#shared/schemas/partners';
import { isUnsafeSvg } from '#shared/utils/partners';

// The partners page at /partners: sponsors, game partners and prize partners, each with a logo
// and a description. Logos are uploaded by admins and kept in Nitro storage (the partner-logos
// mount in nuxt.config.ts). See docs/partners.md.

const MAX_BYTES = 1024 * 1024;
/** Raster logos are scaled down to this width: the page never shows them larger than half of it. */
const MAX_WIDTH = 800;
/** A logo stored this recently may belong to a form not saved yet. */
const PRUNE_GRACE_MS = 24 * 60 * 60 * 1000;
const LOGO_PREFIX = '/api/partners/logos/';

const TYPES = { webp: 'image/webp', svg: 'image/svg+xml' } as const;
type Extension = keyof typeof TYPES;

function refuse(status: number, problem: PartnerProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

function storage() {
  return useStorage('partner-logos');
}

function logoUrl(key: string): string {
  return LOGO_PREFIX + key;
}

// Logos

/**
 * Checks a logo and stores it under the SHA-256 of its bytes. PNG and WebP are decoded and
 * re-encoded as WebP, which drops metadata and keeps transparency. SVG is kept as it is.
 */
async function ingestLogo(input: Buffer): Promise<PartnerLogoView> {
  if (input.length === 0 || input.length > MAX_BYTES) refuse(400, 'imageTooLarge');
  let format: string | undefined;
  try {
    format = (await sharp(input, { limitInputPixels: 64_000_000 }).metadata()).format;
  } catch {
    refuse(400, 'imageUnreadable');
  }
  let bytes: Buffer;
  let extension: Extension;
  if (format === 'svg') {
    if (isUnsafeSvg(input.toString('utf8'))) refuse(400, 'imageUnreadable');
    bytes = input;
    extension = 'svg';
  } else if (format === 'png' || format === 'webp') {
    bytes = await sharp(input, { limitInputPixels: 64_000_000 })
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
    extension = 'webp';
  } else {
    refuse(400, 'imageUnreadable');
  }
  const key = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
  if (!(await storage().hasItem(key))) await storage().setItemRaw(key, bytes);
  return { logoKey: key, logo: logoUrl(key) };
}

/** A stored logo with its type, for /api/partners/logos. */
async function getLogo(key: string): Promise<{ type: string; bytes: Buffer } | undefined> {
  const bytes = await storage().getItemRaw<Buffer>(key);
  if (!bytes) return undefined;
  return { type: TYPES[key.split('.').pop() as Extension], bytes: Buffer.from(bytes) };
}

/** Removes logos no partner uses any more, after a day. Returns how many were removed. */
async function pruneLogos(now = new Date()): Promise<number> {
  const used = new Set((await db.select({ key: partner.logoKey }).from(partner)).map((r) => r.key));
  let removed = 0;
  for (const key of await storage().getKeys()) {
    if (used.has(key)) continue;
    const { mtime } = await storage().getMeta(key);
    if (mtime && now.getTime() - new Date(mtime).getTime() < PRUNE_GRACE_MS) continue;
    await storage().removeItem(key);
    removed++;
  }
  return removed;
}

// Public page

type Row = typeof partner.$inferSelect;

function kindOrder() {
  return sql`CASE ${partner.kind} ${sql.join(
    PARTNER_KINDS.map((kind, index) => sql`WHEN ${kind} THEN ${index}`),
    sql` `,
  )} END`;
}

async function listPublic(): Promise<PartnerPublicView> {
  const rows = await db
    .select()
    .from(partner)
    .where(eq(partner.visible, true))
    .orderBy(kindOrder(), asc(partner.position), asc(partner.createdAt));
  const kinds = PARTNER_KINDS.map((kind) => ({
    kind,
    partners: rows
      .filter((row) => row.kind === kind)
      .map((row) => ({
        id: row.id,
        name: row.name,
        description: { en: row.descriptionEn, fr: row.descriptionFr },
        url: row.url,
        logo: logoUrl(row.logoKey),
      })),
  })).filter((group) => group.partners.length);
  const [setting] = await db.select().from(partnerSetting);
  const contactUrl = (await flagService.isEnabled('partners.contact'))
    ? (setting?.contactUrl ?? null)
    : null;
  return { kinds, contactUrl };
}

// Admin

function adminItem(row: Row): PartnerAdminItem {
  return {
    id: row.id,
    kind: row.kind as PartnerKind,
    name: row.name,
    description: { en: row.descriptionEn, fr: row.descriptionFr },
    url: row.url,
    logo: logoUrl(row.logoKey),
    logoKey: row.logoKey,
    visible: row.visible,
  };
}

async function listAdmin(): Promise<PartnerAdminView> {
  const rows = await db
    .select()
    .from(partner)
    .orderBy(kindOrder(), asc(partner.position), asc(partner.createdAt));
  const [setting] = await db.select().from(partnerSetting);
  return { partners: rows.map(adminItem), contactUrl: setting?.contactUrl ?? null };
}

async function nextPosition(tx: Tx, kind: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number>`coalesce(max(${partner.position}), 0)` })
    .from(partner)
    .where(eq(partner.kind, kind));
  return (row?.max ?? 0) + 1;
}

async function requireLogo(key: string): Promise<void> {
  if (!(await storage().hasItem(key))) refuse(400, 'logoNotFound');
}

async function create(input: { actorId: string; body: PartnerBody }): Promise<{ id: string }> {
  const { body } = input;
  await requireLogo(body.logoKey);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(partner)
      .values({
        kind: body.kind,
        name: body.name,
        descriptionEn: body.description.en,
        descriptionFr: body.description.fr,
        url: body.url,
        logoKey: body.logoKey,
        visible: body.visible,
        position: await nextPosition(tx, body.kind),
      })
      .returning();
    await adminAuditService.record(tx, {
      action: 'partner.create',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: row!.id, name: row!.name },
    });
    return { id: row!.id };
  });
}

async function update(input: {
  actorId: string;
  id: string;
  patch: PartnerPatchBody;
}): Promise<void> {
  const { patch } = input;
  if (patch.logoKey) await requireLogo(patch.logoKey);
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ kind: partner.kind })
      .from(partner)
      .where(eq(partner.id, input.id));
    if (!current) refuse(404, 'partnerNotFound');
    // Another kind puts the partner last there.
    const position =
      patch.kind && patch.kind !== current.kind ? await nextPosition(tx, patch.kind) : undefined;
    const [row] = await tx
      .update(partner)
      .set({
        kind: patch.kind,
        name: patch.name,
        descriptionEn: patch.description?.en,
        descriptionFr: patch.description?.fr,
        // `undefined` leaves the link alone, `null` clears it.
        url: patch.url,
        logoKey: patch.logoKey,
        visible: patch.visible,
        position,
      })
      .where(eq(partner.id, input.id))
      .returning();
    await adminAuditService.record(tx, {
      action: 'partner.update',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: input.id, name: row!.name, patch },
    });
  });
}

async function remove(input: { actorId: string; id: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(partner).where(eq(partner.id, input.id)).returning();
    if (!row) refuse(404, 'partnerNotFound');
    await adminAuditService.record(tx, {
      action: 'partner.delete',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: row.id, name: row.name },
    });
  });
}

/** Swaps a partner with its neighbour of the same kind. At the end, nothing happens. */
async function move(id: string, direction: 'up' | 'down'): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ kind: partner.kind })
      .from(partner)
      .where(eq(partner.id, id));
    if (!current) refuse(404, 'partnerNotFound');
    const rows = await tx
      .select({ id: partner.id })
      .from(partner)
      .where(eq(partner.kind, current.kind))
      .orderBy(asc(partner.position), asc(partner.createdAt))
      .for('update');
    const index = rows.findIndex((row) => row.id === id);
    const other = direction === 'up' ? index - 1 : index + 1;
    if (other < 0 || other >= rows.length) return;
    [rows[index], rows[other]] = [rows[other]!, rows[index]!];
    for (const [position, row] of rows.entries()) {
      await tx.update(partner).set({ position }).where(eq(partner.id, row.id));
    }
  });
}

async function setSettings(input: {
  actorId: string;
  settings: { contactUrl: string | null };
}): Promise<void> {
  const { contactUrl } = input.settings;
  await db.transaction(async (tx) => {
    await tx
      .insert(partnerSetting)
      .values({ id: 1, contactUrl })
      .onConflictDoUpdate({ target: partnerSetting.id, set: { contactUrl } });
    await adminAuditService.record(tx, {
      action: 'partners.settings',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { contactUrl },
    });
  });
}

export const partnerService = {
  ingestLogo,
  getLogo,
  pruneLogos,
  listPublic,
  listAdmin,
  create,
  update,
  remove,
  move,
  setSettings,
};
