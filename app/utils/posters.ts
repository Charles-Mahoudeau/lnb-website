import { formatEventDate } from './events';

import type { PosterBody, PosterContent, PosterView } from '#shared/schemas/posters';
import { allColors, posterArtUrl, resolvePoster } from '#shared/utils/posters';
import type {
  PosterAccent,
  PosterColorElement,
  PosterFields,
  PosterImage,
  PosterLocale,
  PosterTemplate,
  PosterTreatment,
} from '#shared/utils/posters';

// Drawing posters (app/components/posters/). See docs/posters.md.

/** A poster's size in CSS pixels: A4 at 96 dpi. */
export const POSTER_WIDTH = 794;
export const POSTER_HEIGHT = 1123;
/** The PNG export's width, A4 at 300 dpi. */
export const POSTER_PNG_WIDTH = 2480;

/**
 * The print colours of each accent, fixed in both color modes (docs/design.md, Posters). Most
 * parts use `ink`; the sticker and the collage tape have their own.
 */
export const POSTER_ACCENT_COLORS: Record<
  PosterAccent,
  { ink: string; sticker: string; tape: string }
> = {
  violet: { ink: '#5b49c9', sticker: '#5b49c9', tape: 'rgba(169, 155, 255, 0.6)' },
  red: { ink: '#a51f33', sticker: '#b82238', tape: 'rgba(242, 92, 112, 0.55)' },
};

/** Everything a template draws. */
export interface PosterRender {
  template: PosterTemplate;
  treatment: PosterTreatment | null;
  locale: PosterLocale;
  fields: PosterFields;
  content: PosterContent;
  /** The short link the QR code holds. Null: not made yet, so a placeholder is drawn. */
  qrUrl: string | null;
}

/** What a saved poster draws, its event fields resolved. */
export function posterRenderOf(view: PosterView): PosterRender {
  const { fields } = resolvePoster(view.overrides, view.event?.source ?? null, view.locale);
  return {
    template: view.template,
    treatment: view.treatment,
    locale: view.locale,
    fields,
    content: view.content,
    qrUrl: view.qr?.url ?? null,
  };
}

/** The violet-or-red parts each template has, in the order the editor lists them. */
const TEMPLATE_COLORS: Record<PosterTemplate, readonly PosterColorElement[]> = {
  banner: ['kicker', 'date', 'sticker'],
  artTitle: ['kicker', 'date', 'sticker'],
  ticket: ['kicker', 'date', 'sticker'],
  labels: ['label', 'date', 'sticker'],
  collage: ['label', 'tape', 'date', 'sticker'],
  badge: ['strap', 'kicker', 'date', 'sticker'],
};

/** The parts the editor offers a colour for. The duotone tint only shows with that treatment. */
export function posterColorElements(
  template: PosterTemplate,
  treatment: PosterTreatment | null,
): readonly PosterColorElement[] {
  const elements = TEMPLATE_COLORS[template];
  return template === 'artTitle' && treatment === 'duotone' ? [...elements, 'tint'] : elements;
}

/** What the poster editor gives the page around it, through a template ref. */
export interface PosterEditorHandle {
  /** Checks the poster, then emits it to save. */
  submit: () => void;
  png: () => Promise<Blob>;
  /** Edited since it was loaded. */
  dirty: boolean;
  /** The name it would be saved under. */
  name: string;
}

/** What a new poster starts with. */
export function newPosterContent(): PosterContent {
  return {
    sticker: ['', '', ''],
    footer: '',
    qrEnabled: true,
    qrLabel: null,
    photos: [],
    colors: allColors('violet'),
  };
}

/** A saved poster as the body that saves it again. */
export function posterBodyOf(view: PosterView): PosterBody {
  return {
    name: view.name,
    eventId: view.event?.id ?? null,
    template: view.template,
    treatment: view.treatment,
    locale: view.locale,
    overrides: view.overrides,
    content: view.content,
    qrUrl: view.qr && !view.qr.followsEvent ? view.qr.destinationUrl : null,
  };
}

/**
 * School logos for the poster header, by tenant ID, from public/posters/schools/. A school
 * without one gets its name in type.
 */
export const SCHOOL_LOGOS: Readonly<Record<string, { src: string; width: number }>> = {};

/** The art as shown: stored, or treated for an Art title poster. */
export function posterArt(poster: PosterRender): string | null {
  const art = poster.fields.art;
  if (!art) return null;
  const treatment = poster.template === 'artTitle' ? poster.treatment : null;
  return posterArtUrl(art.key, treatment, poster.content.colors.tint);
}

/** A collage photo, the main art when it has none of its own. */
export function posterPhoto(poster: PosterRender, index: number): PosterImage | null {
  return poster.content.photos[index] ?? poster.fields.art;
}

/** `object-position` for an image's focus point. */
export function focusPosition(image: PosterImage): string {
  const percent = (value: number) => `${String(Math.round(value * 100))}%`;
  return `${percent(image.focusX)} ${percent(image.focusY)}`;
}

/** The parts of the date block, in the poster's language and Paris time. */
export function posterDate(iso: string, locale: PosterLocale) {
  const tag = locale === 'fr' ? 'fr-FR' : 'en-GB';
  const part = (options: Intl.DateTimeFormatOptions) => formatEventDate(iso, tag, options);
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const hour = Number(clock.find((p) => p.type === 'hour')?.value);
  const minute = clock.find((p) => p.type === 'minute')?.value ?? '00';
  const hour12 = String(hour % 12 || 12);
  // 19h30 in French, 7:30pm in English. Whole hours drop the minutes.
  const time =
    locale === 'fr'
      ? `${String(hour)}h${minute === '00' ? '' : minute}`
      : `${hour12}${minute === '00' ? '' : `:${minute}`}${hour < 12 ? 'am' : 'pm'}`;
  const weekday = part({ weekday: 'long' });
  return {
    day: part({ day: 'numeric' }),
    month: part({ month: 'long' }),
    when: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${time}`,
  };
}

/** The sticker's lines, or null when all three are empty. */
export function posterSticker(content: PosterContent): [string, string, string] | null {
  return content.sticker.some((line) => line.trim()) ? content.sticker : null;
}

/** Waits until a poster's fonts and images are ready, so a print or a capture shows them. */
export async function posterReady(root: HTMLElement): Promise<void> {
  if ('fonts' in document) {
    await Promise.all(
      [...root.querySelectorAll<HTMLElement>('*')].map((el) => {
        const style = getComputedStyle(el);
        return document.fonts.load(`${style.fontWeight} 16px ${style.fontFamily}`);
      }),
    ).catch(() => undefined);
    await document.fonts.ready;
  }
  await Promise.all(
    [...root.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)),
  );
  // FitTitle measures after the fonts load: give it a frame to settle.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

/** The poster as a PNG at 300 dpi (2480 × 3508), for a download. */
export async function posterPng(root: HTMLElement): Promise<Blob> {
  const { domToBlob } = await import('modern-screenshot');
  await posterReady(root);
  // The size is given, not measured: a poster in a Preview is shrunk on screen by a transform.
  return domToBlob(root, {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    scale: POSTER_PNG_WIDTH / POSTER_WIDTH,
    type: 'image/png',
  });
}
