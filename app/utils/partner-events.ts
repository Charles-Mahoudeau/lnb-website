import type { PartnerGameKey } from '#shared/schemas/partner-events';

/** A game's key in the i18n messages (partnerEvents.games.*): vue-i18n reads hyphens badly. */
export function partnerGameMessageKey(key: PartnerGameKey): string {
  return key.replaceAll(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
}

/** The icon on a game card without art. */
export function partnerGameIcon(_key: PartnerGameKey): string {
  return 'i-lucide-gamepad-2';
}

/** What a student types for one game: the form's state, before it is saved. */
export interface InterestDraft {
  inGameName: string;
  rank: string;
}
