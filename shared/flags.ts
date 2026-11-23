// The feature flags an admin can switch from /admin/settings/flags. This list is the source of truth for
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
  // The public Mods page, which shows the launcher's list (docs/mods-page.md).
  { key: 'modsPage' },
  { key: 'modList' },
  { key: 'modList.voting', parent: 'modList' },
  { key: 'modList.suggestions', parent: 'modList' },
  // The Modrinth and CurseForge search, and mod icons: used by the vote and the Modlist, so not tied to the vote's flag.
  { key: 'modSearch' },
  { key: 'modIcons' },
  // The Files library's public downloads (docs/files.md). Uploading is admin-only, so never gated.
  { key: 'files' },
  // The public modpack manifest the launcher reads (docs/modpack.md).
  { key: 'modpack' },
  // The `retired` list of the manifest: files the updater deletes without having written them (docs/modpack.md).
  { key: 'modpack.retired', parent: 'modpack' },
  // The public download page for new players (docs/downloads.md).
  { key: 'downloads' },
  // The public server rules page (docs/rules.md). Off, the page shows a notice that they are being rewritten.
  { key: 'rules' },
  { key: 'warden' },
  { key: 'warden.linking', parent: 'warden' },
  { key: 'warden.appeals', parent: 'warden' },
  { key: 'warden.serverApi', parent: 'warden' },
  { key: 'warden.clientApi', parent: 'warden' },
  // The weekly playtime limit (docs/playtime.md). Off stops warnings, denials and kicks at once; nothing is deleted.
  { key: 'playtime' },
  { key: 'appLinking' },
  { key: 'avatars' },
  { key: 'avatars.microsoftPhoto', parent: 'avatars' },
  { key: 'events' },
  { key: 'events.home', parent: 'events' },
  { key: 'events.registration', parent: 'events' },
  { key: 'events.teams', parent: 'events' },
  { key: 'events.imageSearch', parent: 'events' },
  { key: 'events.bdeSync', parent: 'events' },
  { key: 'map' },
  { key: 'changelog' },
  // Feed, the short posts of the game phone and the website (docs/feed.md). It ships off; its
  // parts are on, so they follow `feed`. `feed.live` is the browser's live stream.
  { key: 'feed' },
  { key: 'feed.serverApi', parent: 'feed' },
  { key: 'feed.writing', parent: 'feed' },
  { key: 'feed.live', parent: 'feed' },
  { key: 'team' },
  { key: 'team.join', parent: 'team' },
  { key: 'partners' },
  { key: 'partners.contact', parent: 'partners' },
  { key: 'gamesplanet' },
  { key: 'gamesplanet.home', parent: 'gamesplanet' },
  { key: 'gamesplanet.events', parent: 'gamesplanet' },
  { key: 'gamesplanet.footer', parent: 'gamesplanet' },
  { key: 'partnerEvents' },
  { key: 'partnerEvents.interest', parent: 'partnerEvents' },
  { key: 'partnerEvents.teams', parent: 'partnerEvents' },
  { key: 'shortLinks' },
  { key: 'shortLinks.tracking', parent: 'shortLinks' },
  { key: 'apiKeys' },
  { key: 'ghostAccounts' },
  { key: 'economy' },
  { key: 'economy.transfers', parent: 'economy' },
  { key: 'economy.sharedAccounts', parent: 'economy' },
  { key: 'economy.baltop', parent: 'economy' },
  { key: 'economy.serverApi', parent: 'economy' },
  { key: 'economy.shops', parent: 'economy' },
  { key: 'economy.trades', parent: 'economy' },
  { key: 'economy.auctions', parent: 'economy' },
  { key: 'economy.casinoLicenses', parent: 'economy' },
  { key: 'economy.mobDrops', parent: 'economy' },
  { key: 'anticheat' },
  { key: 'anticheat.serverApi', parent: 'anticheat' },
  { key: 'anticheat.lookups', parent: 'anticheat' },
  { key: 'economy.quests', parent: 'economy' },
  // The Market (docs/market.md). It ships off, and its two directions are opened one at a time.
  { key: 'economy.market', parent: 'economy' },
  { key: 'economy.market.sell', parent: 'economy.market' },
  { key: 'economy.market.buy', parent: 'economy.market' },
  { key: 'push' },
  { key: 'push.subscribe', parent: 'push' },
  { key: 'push.newEvents', parent: 'push' },
  { key: 'push.reminders', parent: 'push' },
  { key: 'push.spots', parent: 'push' },
  { key: 'push.changes', parent: 'push' },
  { key: 'push.partnerEvents', parent: 'push' },
  { key: 'jobs' },
  { key: 'jobs.deleteInactive', parent: 'jobs' },
  { key: 'jobs.pruneAvatars', parent: 'jobs' },
  { key: 'jobs.pruneEventImages', parent: 'jobs' },
  { key: 'jobs.prunePartnerLogos', parent: 'jobs' },
  { key: 'jobs.gamesplanetCatalog', parent: 'jobs' },
  { key: 'jobs.gamesplanetDeals', parent: 'jobs' },
  { key: 'jobs.pruneGamesplanetCovers', parent: 'jobs' },
  { key: 'jobs.purgePartnerEvents', parent: 'jobs' },
  { key: 'jobs.closeStaleSessions', parent: 'jobs' },
  { key: 'jobs.pushDeliver', parent: 'jobs' },
  { key: 'jobs.pushPrune', parent: 'jobs' },
  { key: 'jobs.pruneApiKeys', parent: 'jobs' },
  { key: 'jobs.economySnapshot', parent: 'jobs' },
  { key: 'jobs.marketSnapshot', parent: 'jobs' },
  { key: 'jobs.marketPrune', parent: 'jobs' },
  { key: 'jobs.anticheatLookups', parent: 'jobs' },
  { key: 'jobs.anticheatRescore', parent: 'jobs' },
  { key: 'jobs.anticheatPrune', parent: 'jobs' },
  { key: 'jobs.questsIndex', parent: 'jobs' },
  { key: 'jobs.questsCommunity', parent: 'jobs' },
  { key: 'jobs.pruneServerEvents', parent: 'jobs' },
  { key: 'jobs.modpackLatest', parent: 'jobs' },
  { key: 'jobs.playtimePrune', parent: 'jobs' },
  { key: 'jobs.pruneAudit', parent: 'jobs' },
  { key: 'jobs.changelogPublish', parent: 'jobs' },
  { key: 'jobs.feedPurge', parent: 'jobs' },
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
