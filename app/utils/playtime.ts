import type { PlaytimeMe } from '#shared/schemas/playtime';

// How the Minecraft account page words and colors the playtime limit (docs/playtime.md).

const TIME_ZONE = 'Europe/Paris';

/** "17:00" in Paris time. */
export function formatPlaytimeClock(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** "Thursday 9:00", or just "9:00" when the moment is today in Paris. */
export function formatPlaytimeMoment(iso: string, locale: string, now = Date.now()): string {
  const day = (value: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(value));
  const clock = formatPlaytimeClock(iso, locale);
  if (day(new Date(iso).getTime()) === day(now)) return clock;
  const weekday = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, weekday: 'long' }).format(
    new Date(iso),
  );
  return `${weekday} ${clock}`;
}

/** "Monday 23 November, 00:00", for the weekly reset. */
export function formatPlaytimeReset(iso: string, locale: string): string {
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
  return `${date}, ${formatPlaytimeClock(iso, locale)}`;
}

/** The share of the allowance below which the player is told it is almost used. */
export const PLAYTIME_LOW_SHARE = 0.25;

export type PlaytimeTone = 'secondary' | 'grace' | 'success' | 'warning' | 'error' | 'neutral';

export interface PlaytimeBand {
  /** The i18n key after `minecraftAccount.playtime.states.`. */
  key: string;
  /** Values for the title and line. */
  values: Record<string, string>;
  tone: PlaytimeTone;
  icon: string;
}

const ICONS: Record<string, string> = {
  counting: 'i-lucide-clock',
  grace: 'i-lucide-heart',
  free: 'i-lucide-circle-check',
  blocked: 'i-lucide-circle-pause',
  unlimited: 'i-lucide-infinity',
};

/** What the state band says: the state, its tone and icon, and the times its line needs. */
export function playtimeBand(me: PlaytimeMe, locale: string, now = Date.now()): PlaytimeBand {
  const at = (iso: string | null) => (iso ? formatPlaytimeMoment(iso, locale, now) : '');
  if (me.state === 'unlimited') {
    const reason = me.reason ?? 'off';
    return {
      key: reason === 'closed' && !me.nextChangeAt ? 'unlimited.closedOpen' : `unlimited.${reason}`,
      values: { until: at(me.nextChangeAt) },
      tone: 'neutral',
      icon: ICONS.unlimited!,
    };
  }
  if (me.state === 'counting') {
    const low =
      me.allowanceSeconds > 0 && me.remainingSeconds / me.allowanceSeconds <= PLAYTIME_LOW_SHARE;
    return {
      key: low ? 'low' : 'counting',
      values: { until: at(me.windowEndsAt) },
      tone: low ? 'warning' : 'secondary',
      icon: ICONS.counting!,
    };
  }
  if (me.state === 'grace') {
    return {
      key: 'grace',
      values: { until: at(me.graceEndsAt) },
      tone: 'grace',
      icon: ICONS.grace!,
    };
  }
  if (me.state === 'blocked') {
    return {
      key: 'blocked',
      values: { when: at(me.resumesAt) },
      tone: 'error',
      icon: ICONS.blocked!,
    };
  }
  return {
    key: me.nextWindowStartsAt ? 'free' : 'freeNoWindow',
    values: { when: at(me.nextWindowStartsAt) },
    tone: 'success',
    icon: ICONS.free!,
  };
}

/** Class names per tone, written out so Tailwind sees them. */
export const PLAYTIME_TONE_CLASSES: Record<
  PlaytimeTone,
  { text: string; bar: string; band: string }
> = {
  secondary: { text: 'text-secondary', bar: 'bg-secondary', band: 'bg-secondary/10' },
  grace: { text: 'text-grace', bar: 'bg-grace', band: 'bg-grace/10' },
  success: { text: 'text-success', bar: 'bg-success', band: 'bg-success/10' },
  warning: { text: 'text-warning', bar: 'bg-warning', band: 'bg-warning/10' },
  error: { text: 'text-error', bar: 'bg-error', band: 'bg-error/10' },
  neutral: { text: 'text-muted', bar: 'bg-muted', band: 'bg-accented' },
};
