import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';

import { eq } from 'drizzle-orm';
import { useStorage } from 'nitropack/runtime';
import sharp from 'sharp';
import type { Sharp } from 'sharp';

import { db } from '~~/server/db';
import { event, poster } from '~~/server/db/schema';

import { focalCrop, isPrivateAddress } from './rules';
import { refuse } from './shared';

import type { PosterAccent, PosterTreatment } from '#shared/utils/posters';

// Event images, kept in Nitro storage (the event-images mount in nuxt.config.ts, on the VPS's
// disk). Whatever comes in (an upload, a link, SteamGridDB) is decoded and re-encoded by sharp,
// which drops metadata such as EXIF and anything that isn't a picture. Each file is stored under
// the SHA-256 of its bytes with its format as extension, and served from /api/media/<key>.

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
/** Wider originals are scaled down: crops never need more. */
const MAX_WIDTH = 3840;
const INPUT_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);
/** A file stored this recently may belong to a form not saved yet. */
const PRUNE_GRACE_MS = 24 * 60 * 60 * 1000;

const TYPES = { webp: 'image/webp', jpg: 'image/jpeg' } as const;
type Extension = keyof typeof TYPES;

/** The crops each event gets: page banner, agenda thumbnail, social embed. */
export const CROPS = {
  banner: { width: 1920, height: 620, format: 'webp' },
  thumb: { width: 640, height: 360, format: 'webp' },
  // Some embeds (and the BDE website) don't take WebP.
  embed: { width: 1200, height: 630, format: 'jpg' },
} as const;

function storage() {
  return useStorage('event-images');
}

async function store(bytes: Buffer, extension: Extension): Promise<string> {
  const key = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
  if (!(await storage().hasItem(key))) await storage().setItemRaw(key, bytes);
  return key;
}

export interface StoredImage {
  key: string;
  width: number;
  height: number;
}

/** Decodes an image, checks it, and stores it as WebP. Animated GIFs keep their first frame. */
async function ingest(input: Buffer): Promise<StoredImage> {
  if (input.length === 0 || input.length > MAX_BYTES) refuse(400, 'imageTooLarge');
  let image: Sharp;
  let format: string | undefined;
  try {
    image = sharp(input, { animated: false, limitInputPixels: 64_000_000 });
    format = (await image.metadata()).format;
  } catch {
    refuse(400, 'imageUnreadable');
  }
  if (!format || !INPUT_FORMATS.has(format)) refuse(400, 'imageUnreadable');
  const { data, info } = await image
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer({ resolveWithObject: true });
  return { key: await store(data, 'webp'), width: info.width, height: info.height };
}

/** Refuses a host that resolves to a private, loopback or link-local address. */
async function checkHost(hostname: string): Promise<void> {
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname.replace(/^\[|\]$/g, ''), { all: true });
  } catch {
    refuse(400, 'imageUnreachable');
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    refuse(400, 'imageUnreachable');
  }
}

/**
 * Downloads an image from an https link and stores it. Each hop of a redirect is checked again.
 * With `hosts`, only those hosts are fetched (a provider's CDN).
 */
async function importUrl(url: string, hosts?: ReadonlySet<string>): Promise<StoredImage> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let target: URL;
    try {
      target = new URL(current);
    } catch {
      refuse(400, 'imageUnreachable');
    }
    if (target.protocol !== 'https:' || target.username || target.password) {
      refuse(400, 'imageUnreachable');
    }
    if (hosts && !hosts.has(target.host)) refuse(400, 'imageUnreachable');
    await checkHost(target.hostname);

    let response: Response;
    try {
      response = await fetch(target, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: 'image/*' },
      });
    } catch {
      refuse(400, 'imageUnreachable');
    }
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, target).toString();
      continue;
    }
    if (!response.ok || !response.body) refuse(400, 'imageUnreachable');
    if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) {
      refuse(400, 'imageTooLarge');
    }
    return ingest(await readCapped(response.body));
  }
  refuse(400, 'imageUnreachable');
}

/** Reads a body, stopping as soon as it passes the size limit. */
async function readCapped(body: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.length;
    if (size > MAX_BYTES) refuse(400, 'imageTooLarge');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** A stored image with its type, for /api/media. */
async function get(key: string): Promise<{ type: string; bytes: Buffer } | undefined> {
  const bytes = await storage().getItemRaw<Buffer>(key);
  if (!bytes) return undefined;
  const extension = key.split('.').pop() as Extension;
  return { type: TYPES[extension], bytes: Buffer.from(bytes) };
}

async function exists(key: string): Promise<boolean> {
  return storage().hasItem(key);
}

/** Cuts one crop out of a stored original, around the focal point. */
async function crop(
  key: string,
  shape: (typeof CROPS)[keyof typeof CROPS],
  focusX: number,
  focusY: number,
): Promise<string> {
  const original = await storage().getItemRaw<Buffer>(key);
  if (!original) refuse(400, 'imageNotFound');
  const image = sharp(Buffer.from(original));
  const { width, height } = await image.metadata();
  const region = focalCrop(width, height, shape.width / shape.height, focusX, focusY);
  const resized = image.extract(region).resize(shape.width, shape.height, { fit: 'cover' });
  const bytes =
    shape.format === 'jpg'
      ? await resized
          .flatten({ background: '#13173a' })
          .jpeg({ quality: 85, mozjpeg: true })
          .toBuffer()
      : await resized.webp({ quality: 85 }).toBuffer();
  return store(bytes, shape.format);
}

export interface PickedImage {
  key: string;
  focusX: number;
  focusY: number;
}

/** The three crops of an event: from the banner, and the embed from its own image if it has one. */
async function crops(banner: PickedImage, embed: PickedImage | null) {
  const source = embed ?? banner;
  const [bannerCropKey, thumbCropKey, embedCropKey] = await Promise.all([
    crop(banner.key, CROPS.banner, banner.focusX, banner.focusY),
    crop(banner.key, CROPS.thumb, banner.focusX, banner.focusY),
    crop(source.key, CROPS.embed, source.focusX, source.focusY),
  ]);
  return { bannerCropKey, thumbCropKey, embedCropKey };
}

/** Bumped when a treatment changes, so treated files are made again. */
const TREATMENT_VERSION = '1';
/** Wider art is scaled down: a poster is 2480 pixels wide at 300 dpi. */
const TREAT_MAX_WIDTH = 2480;
const NAVY = [0x0b, 0x0e, 0x27];
const TINTS: Record<PosterAccent, number[]> = {
  violet: [0x5b, 0x49, 0xc9],
  red: [0xa5, 0x1f, 0x33],
};

/** Where the treated art is kept, from what it is made of. The tint only counts for duotone. */
export function treatedName(key: string, treatment: PosterTreatment, tint: PosterAccent): string {
  const tone = treatment === 'duotone' ? tint : 'none';
  const hash = createHash('sha256').update(`${TREATMENT_VERSION}:${key}:${treatment}:${tone}`);
  return `treated:${hash.digest('hex')}.webp`;
}

/**
 * The art behind an Art title poster, treated: duotone maps dark to navy and light to the tint,
 * the dark ones dim it. Made on first use, then kept.
 */
async function treated(
  key: string,
  treatment: PosterTreatment,
  tint: PosterAccent,
): Promise<Buffer> {
  const name = treatedName(key, treatment, tint);
  const kept = await storage().getItemRaw<Buffer>(name);
  if (kept) return Buffer.from(kept);
  const original = await storage().getItemRaw<Buffer>(key);
  if (!original) refuse(404, 'imageNotFound');
  const image = sharp(Buffer.from(original))
    .resize({ width: TREAT_MAX_WIDTH, withoutEnlargement: true })
    .flatten({ background: '#ffffff' });
  let bytes: Buffer;
  if (treatment === 'duotone') {
    const { data, info } = await image.greyscale().raw().toBuffer({ resolveWithObject: true });
    const to = TINTS[tint];
    const pixels = info.width * info.height;
    const out = Buffer.alloc(pixels * 3);
    for (let i = 0; i < pixels; i++) {
      const grey = data[i * info.channels]! / 255;
      for (let c = 0; c < 3; c++)
        out[i * 3 + c] = Math.round(NAVY[c]! + (to[c]! - NAVY[c]!) * grey);
    }
    bytes = await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
      .webp({ quality: 85 })
      .toBuffer();
  } else {
    bytes = await image
      .modulate({ brightness: treatment === 'darkMedium' ? 0.6 : 0.4 })
      .webp({ quality: 85 })
      .toBuffer();
  }
  await storage().setItemRaw(name, bytes);
  return bytes;
}

/** The files posters use: their art (pinned, or their event's banner), treated art and photos. */
async function posterKeys(): Promise<string[]> {
  const rows = await db
    .select({
      treatment: poster.treatment,
      overrides: poster.overrides,
      content: poster.content,
      bannerKey: event.bannerKey,
    })
    .from(poster)
    .leftJoin(event, eq(event.id, poster.eventId));
  return rows.flatMap((row) => {
    const art = row.overrides.art !== undefined ? row.overrides.art?.key : row.bannerKey;
    const photos = row.content.photos.flatMap((photo) => (photo ? [photo.key] : []));
    if (!art) return photos;
    const treatedArt = row.treatment
      ? [treatedName(art, row.treatment as PosterTreatment, row.content.colors.tint)]
      : [];
    return [art, ...treatedArt, ...photos];
  });
}

/**
 * Removes files no event or poster points to any more, after a day. Returns how many were
 * removed.
 */
async function prune(now = new Date()): Promise<number> {
  const rows = await db
    .select({
      a: event.bannerKey,
      b: event.embedKey,
      c: event.bannerCropKey,
      d: event.thumbCropKey,
      e: event.embedCropKey,
    })
    .from(event);
  const used = new Set([
    ...rows.flatMap((row) => Object.values(row)).filter(Boolean),
    ...(await posterKeys()),
  ]);
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

export const eventImageService = { ingest, importUrl, get, exists, crops, treated, prune };
