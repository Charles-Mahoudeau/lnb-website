// The feature flags an admin can switch from /admin/flags. This list is the source of truth for
// which flags exist: the database only stores the ones an admin changed. See docs/feature-flags.md
// to add one.

export interface FlagDefinition {
  key: string;
  /** The flag this one is a part of. When the parent is off, so is this one. */
  parent?: string;
}

// `as const satisfies` keeps the keys as literal types, so requireFlag('typo') fails typecheck.
export const FLAG_DEFINITIONS = [
  { key: 'signIn' },
  { key: 'signIn.epitech', parent: 'signIn' },
  { key: 'signIn.eartsup', parent: 'signIn' },
  { key: 'signIn.iseg', parent: 'signIn' },
  { key: 'modList' },
  { key: 'modList.voting', parent: 'modList' },
  { key: 'modList.suggestions', parent: 'modList' },
  { key: 'modList.search', parent: 'modList' },
  { key: 'modList.icons', parent: 'modList' },
  { key: 'warden' },
  { key: 'warden.linking', parent: 'warden' },
  { key: 'warden.appeals', parent: 'warden' },
  { key: 'warden.serverApi', parent: 'warden' },
  { key: 'appLinking' },
  { key: 'avatars' },
  { key: 'avatars.microsoftPhoto', parent: 'avatars' },
  { key: 'events' },
  { key: 'events.home', parent: 'events' },
  { key: 'events.registration', parent: 'events' },
  { key: 'jobs' },
  { key: 'jobs.deleteInactive', parent: 'jobs' },
  { key: 'jobs.pruneAvatars', parent: 'jobs' },
  { key: 'jobs.closeStaleSessions', parent: 'jobs' },
] as const satisfies readonly FlagDefinition[];

export type FlagKey = (typeof FLAG_DEFINITIONS)[number]['key'];

/** Every flag is on until an admin turns it off. */
export const FLAG_KEYS = FLAG_DEFINITIONS.map((flag) => flag.key) as [FlagKey, ...FlagKey[]];

/** The flag's key in the i18n messages (admin.flags.items.*): vue-i18n reads dots as nesting. */
export function flagMessageKey(key: FlagKey): string {
  return key.replaceAll('.', '_');
}

export function isFlagKey(key: string): key is FlagKey {
  return (FLAG_KEYS as readonly string[]).includes(key);
}

/** The effective state of every flag, given the stored overrides. A parent off turns its parts off. */
export function resolveFlags(overrides: ReadonlyMap<string, boolean>): Record<FlagKey, boolean> {
  const result = {} as Record<FlagKey, boolean>;
  // Parents come before their parts in FLAG_DEFINITIONS, so result[parent] is already set.
  for (const flag of FLAG_DEFINITIONS as readonly FlagDefinition[]) {
    const own = overrides.get(flag.key) ?? true;
    result[flag.key as FlagKey] = own && (flag.parent ? result[flag.parent as FlagKey] : true);
  }
  return result;
}
