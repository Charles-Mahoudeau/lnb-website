import en from '../../../i18n/locales/en.json' with { type: 'json' };
import fr from '../../../i18n/locales/fr.json' with { type: 'json' };
import type { PushKindName } from '../../../shared/schemas/push.ts';

// The text of a notification, in the language saved on the device. Strings live in the locale
// files under push.message. No database and no Nuxt imports, so unit tests can load this.

export type PushLocale = 'en' | 'fr';

const MESSAGES = { en: en.push.message, fr: fr.push.message } as const;
const ZONE = 'Europe/Paris';
const INTL_LOCALE: Record<PushLocale, string> = { en: 'en-GB', fr: 'fr-FR' };

export interface PushEventInfo {
  id: string;
  name: string;
  startsAt: Date;
  room: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** The page a tap opens. */
  url: string;
  /** Replaces an earlier notification with the same tag, such as two reminders of an event. */
  tag: string;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}

/** "in 1 hour", "dans 2 jours". */
export function relativeOffset(minutes: number, locale: PushLocale): string {
  const formatter = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: 'always' });
  if (minutes >= 10080 && minutes % 10080 === 0) return formatter.format(minutes / 10080, 'week');
  if (minutes >= 1440 && minutes % 1440 === 0) return formatter.format(minutes / 1440, 'day');
  if (minutes >= 60 && minutes % 60 === 0) return formatter.format(minutes / 60, 'hour');
  return formatter.format(minutes, 'minute');
}

export function buildMessage(
  kind: PushKindName,
  locale: PushLocale,
  info: PushEventInfo,
  params: { offset?: number } = {},
): PushMessage {
  const intl = INTL_LOCALE[locale];
  const date = new Intl.DateTimeFormat(intl, {
    timeZone: ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(info.startsAt);
  const time = new Intl.DateTimeFormat(intl, {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(info.startsAt);
  const values = {
    name: info.name,
    room: info.room,
    date,
    time,
    relative: relativeOffset(params.offset ?? 60, locale),
  };
  const template = MESSAGES[locale][kind];
  return {
    title: fill(template.title, values),
    body: fill(template.body, values),
    url: `/events/${info.id}`,
    tag: `${kind === 'newEvent' ? 'new' : 'event'}:${info.id}`,
  };
}
