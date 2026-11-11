import en from '../../../i18n/locales/en.json' with { type: 'json' };
import fr from '../../../i18n/locales/fr.json' with { type: 'json' };
import type { PushKindName } from '../../../shared/schemas/push.ts';

// The text of a notification, in the language saved on the device. Strings live in the locale
// files under push.message. No database and no Nuxt imports, so unit tests can load this.

export type PushLocale = 'en' | 'fr';

const MESSAGES = { en: en.push.message, fr: fr.push.message } as const;
const ZONE = 'Europe/Paris';
const INTL_LOCALE: Record<PushLocale, string> = { en: 'en-GB', fr: 'fr-FR' };

/** Why a team notification is sent: the key of its text under push.message.team. */
export type TeamReason = keyof (typeof MESSAGES)['en']['team'];

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
  kind: Exclude<PushKindName, 'partnerEvent' | 'partnerTeam'>,
  locale: PushLocale,
  info: PushEventInfo,
  params: { offset?: number; reason?: TeamReason; team?: string; who?: string } = {},
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
    team: params.team ?? '',
    who: params.who ?? '',
  };
  const template =
    kind === 'team' ? MESSAGES[locale].team[params.reason ?? 'invited'] : MESSAGES[locale][kind];
  return {
    title: fill(template.title, values),
    body: fill(template.body, values),
    url: `/events/${info.id}`,
    tag: `${kind === 'newEvent' ? 'new' : 'event'}:${info.id}`,
  };
}

/** Why a partner team notification is sent: the key of its text under push.message.partnerTeam. */
export type PartnerTeamReason = keyof (typeof MESSAGES)['en']['partnerTeam'];

/** The name of a partner event, from the locale files. Unknown slugs show as they are. */
const PARTNER_NAMES: Record<string, Record<PushLocale, string>> = {
  'arena-league-universite-2027': {
    en: en.partnerEvents.arenaLeague2027.title,
    fr: fr.partnerEvents.arenaLeague2027.title,
  },
};

const GAME_NAMES: Record<PushLocale, Record<string, string>> = {
  en: en.partnerEvents.games,
  fr: fr.partnerEvents.games,
};

/** The text of a partner event notification: the announcement, or news of a team. */
export function buildPartnerMessage(
  kind: 'partnerEvent' | 'partnerTeam',
  locale: PushLocale,
  slug: string,
  params: { reason?: PartnerTeamReason; game?: string; team?: string; who?: string } = {},
): PushMessage {
  const values = {
    name: PARTNER_NAMES[slug]?.[locale] ?? slug,
    game: GAME_NAMES[locale][params.game ?? ''] ?? params.game ?? '',
    team: params.team ?? '',
    who: params.who ?? '',
  };
  const template =
    kind === 'partnerTeam'
      ? MESSAGES[locale].partnerTeam[params.reason ?? 'invited']
      : MESSAGES[locale].partnerEvent;
  return {
    title: fill(template.title, values),
    body: fill(template.body, values),
    url: `/special/${slug}`,
    tag: kind === 'partnerEvent' ? `partner:${slug}` : `partner-team:${slug}:${params.game ?? ''}`,
  };
}
