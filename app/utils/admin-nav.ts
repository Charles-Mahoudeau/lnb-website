import {
  isAdmin,
  isEconomyAdmin,
  isEventsManager,
  isWardenAdmin,
} from '../../shared/utils/roles.ts';

// The admin's navigation, as data: the sidebar entries with their tabs, and the Settings sections.
// The layout, the tab rows and the Settings page all read it, and it holds the role rules, so one
// test covers who sees what (docs/plans/admin-redesign.md). Labels are i18n keys.

/** The roles that open parts of the admin. Site admins pass every check. */
export type AdminArea = 'admin' | 'warden' | 'events' | 'economy';

const CHECKS: Record<AdminArea, (role: string | null | undefined) => boolean> = {
  admin: isAdmin,
  warden: isWardenAdmin,
  events: isEventsManager,
  economy: isEconomyAdmin,
};

/** Whether a role list holds at least one of the areas. A person with several roles gets the union. */
export function hasAdminArea(role: string | null | undefined, areas: AdminArea[]): boolean {
  return areas.some((area) => CHECKS[area](role));
}

export interface AdminTab {
  id: string;
  labelKey: string;
  to: string;
  /** Active only on this exact path, not under it. */
  exact?: boolean;
  /** The feature flag that hides this tab when it is off. */
  flag?: 'modList';
}

export interface AdminEntry {
  id: string;
  labelKey: string;
  icon: string;
  /** Where the sidebar entry goes: its first tab. */
  to: string;
  /** The entry is active on this path and under it. */
  base: string;
  exact?: boolean;
  areas: AdminArea[];
  group?: 'events' | 'minecraft';
  tabs?: AdminTab[];
}

const ALL: AdminArea[] = ['admin', 'warden', 'events', 'economy'];

export const ADMIN_ENTRIES: AdminEntry[] = [
  {
    id: 'home',
    labelKey: 'admin.nav.home',
    icon: 'i-lucide-layout-dashboard',
    to: '/admin',
    base: '/admin',
    exact: true,
    areas: ALL,
  },
  {
    id: 'people',
    labelKey: 'admin.nav.people',
    icon: 'i-lucide-users',
    to: '/admin/people',
    base: '/admin/people',
    // Everyone who can open the admin: what the list and the Person page show follows the role.
    areas: ['admin', 'warden', 'events', 'economy'],
  },
  {
    id: 'shortLinks',
    labelKey: 'admin.nav.shortLinks',
    icon: 'i-lucide-link',
    to: '/admin/short-links',
    base: '/admin/short-links',
    areas: ['events'],
  },
  {
    id: 'site',
    labelKey: 'admin.nav.site',
    icon: 'i-lucide-globe',
    to: '/admin/site/team',
    base: '/admin/site',
    areas: ['admin'],
    tabs: [
      { id: 'team', labelKey: 'admin.nav.team', to: '/admin/site/team' },
      { id: 'partners', labelKey: 'admin.nav.partners', to: '/admin/site/partners' },
      { id: 'gamesplanet', labelKey: 'admin.nav.gamesplanet', to: '/admin/site/gamesplanet' },
    ],
  },
  {
    id: 'events',
    labelKey: 'admin.nav.events',
    icon: 'i-lucide-calendar',
    to: '/admin/events',
    base: '/admin/events',
    areas: ['events'],
    group: 'events',
  },
  {
    id: 'posters',
    labelKey: 'admin.nav.posters',
    icon: 'i-lucide-image',
    to: '/admin/posters',
    base: '/admin/posters',
    areas: ['events'],
    group: 'events',
  },
  {
    id: 'notifications',
    labelKey: 'admin.nav.notifications',
    icon: 'i-lucide-bell',
    to: '/admin/notifications',
    base: '/admin/notifications',
    areas: ['events'],
    group: 'events',
  },
  {
    id: 'partnerEvents',
    labelKey: 'admin.nav.partnerEvents',
    icon: 'i-lucide-trophy',
    to: '/admin/partner-events',
    base: '/admin/partner-events',
    areas: ['events'],
    group: 'events',
  },
  {
    id: 'moderation',
    labelKey: 'admin.nav.moderation',
    icon: 'i-lucide-gavel',
    to: '/admin/moderation/appeals',
    base: '/admin/moderation',
    areas: ['warden'],
    group: 'minecraft',
    tabs: [
      { id: 'appeals', labelKey: 'admin.nav.appeals', to: '/admin/moderation/appeals' },
      { id: 'bans', labelKey: 'admin.nav.bans', to: '/admin/moderation/bans' },
      { id: 'rules', labelKey: 'admin.nav.rules', to: '/admin/moderation/rules' },
    ],
  },
  {
    id: 'playtime',
    labelKey: 'admin.nav.playtime',
    icon: 'i-lucide-clock',
    to: '/admin/playtime/live',
    base: '/admin/playtime',
    areas: ['warden'],
    group: 'minecraft',
    tabs: [
      { id: 'live', labelKey: 'admin.nav.live', to: '/admin/playtime/live' },
      { id: 'rules', labelKey: 'admin.nav.rules', to: '/admin/playtime/rules' },
      { id: 'closures', labelKey: 'admin.nav.closures', to: '/admin/playtime/closures' },
    ],
  },
  {
    id: 'anticheat',
    labelKey: 'admin.nav.anticheat',
    icon: 'i-lucide-shield-check',
    to: '/admin/anticheat/review',
    base: '/admin/anticheat',
    areas: ['warden'],
    group: 'minecraft',
    tabs: [
      { id: 'review', labelKey: 'admin.nav.review', to: '/admin/anticheat/review' },
      { id: 'files', labelKey: 'admin.nav.files', to: '/admin/anticheat/files' },
    ],
  },
  {
    id: 'modpack',
    labelKey: 'admin.nav.modpack',
    icon: 'i-lucide-blocks',
    to: '/admin/modpack/modlist',
    base: '/admin/modpack',
    areas: ['warden'],
    group: 'minecraft',
    tabs: [
      { id: 'modlist', labelKey: 'admin.nav.modlist', to: '/admin/modpack/modlist' },
      // The vote is a feature that can be switched off (the modList flag).
      { id: 'vote', labelKey: 'admin.nav.vote', to: '/admin/modpack/vote', flag: 'modList' },
      { id: 'files', labelKey: 'admin.nav.files', to: '/admin/modpack/files' },
      { id: 'downloads', labelKey: 'admin.nav.downloads', to: '/admin/modpack/downloads' },
    ],
  },
  {
    id: 'economy',
    labelKey: 'admin.nav.economy',
    icon: 'i-lucide-landmark',
    to: '/admin/economy',
    base: '/admin/economy',
    areas: ['economy'],
    group: 'minecraft',
    tabs: [
      { id: 'overview', labelKey: 'admin.nav.overview', to: '/admin/economy', exact: true },
      { id: 'accounts', labelKey: 'admin.nav.accounts', to: '/admin/economy/accounts' },
      { id: 'ledger', labelKey: 'admin.nav.ledger', to: '/admin/economy/ledger' },
    ],
  },
  {
    id: 'quests',
    labelKey: 'admin.nav.quests',
    icon: 'i-lucide-scroll-text',
    to: '/admin/quests/catalog',
    base: '/admin/quests',
    areas: ['economy'],
    group: 'minecraft',
    tabs: [
      { id: 'catalog', labelKey: 'admin.nav.catalog', to: '/admin/quests/catalog' },
      { id: 'community', labelKey: 'admin.nav.community', to: '/admin/quests/community' },
      { id: 'categories', labelKey: 'admin.nav.categories', to: '/admin/quests/categories' },
      { id: 'rewardIndex', labelKey: 'admin.nav.rewardIndex', to: '/admin/quests/reward-index' },
    ],
  },
];

/** The sidebar entries a role sees, in order. */
export function adminEntries(role: string | null | undefined): AdminEntry[] {
  return ADMIN_ENTRIES.filter((entry) => hasAdminArea(role, entry.areas));
}

export function adminEntry(id: string): AdminEntry {
  const entry = ADMIN_ENTRIES.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown admin entry: ${id}`);
  return entry;
}

/** The tabs of an entry, without those whose feature flag is off. */
export function adminTabs(id: string, isEnabled: (flag: 'modList') => boolean): AdminTab[] {
  return (adminEntry(id).tabs ?? []).filter((tab) => !tab.flag || isEnabled(tab.flag));
}

/** Whether an entry is the current one for a path. */
export function entryIsActive(entry: AdminEntry, path: string): boolean {
  if (entry.exact) return path === entry.base;
  return path === entry.base || path.startsWith(`${entry.base}/`);
}

export interface PersonTab {
  id: string;
  labelKey: string;
  areas: AdminArea[];
  /** Ghost accounts have no Minecraft side: they only get the tabs marked here. */
  ghost: boolean;
}

/** The tabs of the Person page, in order (docs/plans/admin-redesign.md). Site admins pass every check. */
export const PERSON_TABS: PersonTab[] = [
  { id: 'summary', labelKey: 'admin.person.tabs.summary', areas: ALL, ghost: true },
  { id: 'minecraft', labelKey: 'admin.person.tabs.minecraft', areas: ['warden'], ghost: false },
  { id: 'moderation', labelKey: 'admin.person.tabs.moderation', areas: ['warden'], ghost: false },
  { id: 'playtime', labelKey: 'admin.person.tabs.playtime', areas: ['warden'], ghost: false },
  { id: 'anticheat', labelKey: 'admin.person.tabs.anticheat', areas: ['warden'], ghost: false },
  { id: 'lnbits', labelKey: 'admin.person.tabs.lnbits', areas: ['economy'], ghost: false },
  { id: 'events', labelKey: 'admin.person.tabs.events', areas: ['events'], ghost: true },
  { id: 'account', labelKey: 'admin.person.tabs.account', areas: ['admin'], ghost: true },
];

/** The Person tabs a role sees for an account, in order. */
export function personTabs(role: string | null | undefined, ghost: boolean): PersonTab[] {
  return PERSON_TABS.filter((tab) => hasAdminArea(role, tab.areas) && (!ghost || tab.ghost));
}

export type SettingsArea = 'general' | 'site' | 'events' | 'minecraft';

export interface SettingsSection {
  id: string;
  labelKey: string;
  icon: string;
  area: SettingsArea;
  areas: AdminArea[];
}

export const SETTINGS_AREAS: { id: SettingsArea; labelKey: string }[] = [
  { id: 'general', labelKey: 'admin.settings.areas.general' },
  { id: 'site', labelKey: 'admin.settings.areas.site' },
  { id: 'events', labelKey: 'admin.settings.areas.events' },
  { id: 'minecraft', labelKey: 'admin.settings.areas.minecraft' },
];

function section(
  id: string,
  icon: string,
  area: SettingsArea,
  areas: AdminArea[],
): SettingsSection {
  return { id, labelKey: `admin.settings.sections.${id}.title`, icon, area, areas };
}

/** In list order. Sections whose form doesn't exist yet are left out, not shown empty. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  section('activity', 'i-lucide-history', 'general', ['admin', 'warden', 'events', 'economy']),
  section('flags', 'i-lucide-toggle-right', 'general', ['admin']),
  section('rate-limit', 'i-lucide-gauge', 'general', ['admin']),
  section('api-keys', 'i-lucide-key-round', 'general', ['admin']),
  section('map', 'i-lucide-map', 'site', ['admin']),
  section('team', 'i-lucide-users-round', 'site', ['admin']),
  section('partners', 'i-lucide-handshake', 'site', ['admin']),
  section('gamesplanet', 'i-lucide-gamepad-2', 'site', ['admin']),
  section('rooms', 'i-lucide-door-open', 'events', ['events']),
  section('types', 'i-lucide-tags', 'events', ['events']),
  section('notifications', 'i-lucide-bell', 'events', ['events']),
  section('warden', 'i-lucide-pickaxe', 'minecraft', ['warden']),
  section('anticheat', 'i-lucide-shield-check', 'minecraft', ['warden']),
  section('modpack', 'i-lucide-blocks', 'minecraft', ['warden']),
  section('playtime', 'i-lucide-clock', 'minecraft', ['warden']),
  section('economy', 'i-lucide-landmark', 'minecraft', ['economy']),
  section('quests', 'i-lucide-scroll-text', 'minecraft', ['economy']),
];

/** The Settings sections a role may open, in order. */
export function settingsSections(role: string | null | undefined): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((candidate) => hasAdminArea(role, candidate.areas));
}

export interface AdminSearchPage {
  id: string;
  /** The page's own label, or the entry's then the tab's, joined by a chevron by the search. */
  labelKeys: string[];
  icon: string;
  to: string;
}

/**
 * The pages Ctrl K opens for a role: one per entry, or one per tab for an entry with tabs. Tabs
 * whose feature flag is off are left out, like in the tab rows.
 */
export function adminSearchPages(
  role: string | null | undefined,
  isEnabled: (flag: 'modList') => boolean,
): AdminSearchPage[] {
  return adminEntries(role).flatMap((entry): AdminSearchPage[] => {
    const tabs = adminTabs(entry.id, isEnabled);
    if (!tabs.length) {
      return [{ id: entry.id, labelKeys: [entry.labelKey], icon: entry.icon, to: entry.to }];
    }
    return tabs.map((tab) => ({
      id: `${entry.id}.${tab.id}`,
      labelKeys: [entry.labelKey, tab.labelKey],
      icon: entry.icon,
      to: tab.to,
    }));
  });
}

export interface AdminAction {
  id: string;
  labelKey: string;
  icon: string;
  to: string;
  areas: AdminArea[];
}

/** The quick actions of Ctrl K. Each one goes to a page the same role can open. */
export const ADMIN_ACTIONS: AdminAction[] = [
  {
    id: 'banPlayer',
    labelKey: 'admin.search.actions.banPlayer',
    icon: 'i-lucide-gavel',
    to: '/admin/people',
    areas: ['warden'],
  },
  {
    id: 'newEvent',
    labelKey: 'admin.search.actions.newEvent',
    icon: 'i-lucide-calendar-plus',
    to: '/admin/events/new',
    areas: ['events'],
  },
  {
    id: 'adjustBalance',
    labelKey: 'admin.search.actions.adjustBalance',
    icon: 'i-lucide-landmark',
    to: '/admin/economy/accounts',
    areas: ['economy'],
  },
  {
    id: 'newShortLink',
    labelKey: 'admin.search.actions.newShortLink',
    icon: 'i-lucide-link',
    // The short links page opens its create drawer for `new`.
    to: '/admin/short-links?new=1',
    areas: ['events'],
  },
];

/** The quick actions a role may use, in order. */
export function adminActions(role: string | null | undefined): AdminAction[] {
  return ADMIN_ACTIONS.filter((action) => hasAdminArea(role, action.areas));
}
