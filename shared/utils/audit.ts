import { isAdmin, isEconomyAdmin, isEventsManager, isWardenAdmin } from './roles.ts';

// The activity log's areas and who sees which (docs/activity-log.md). The server filters with
// `activityPrefixes`, the page offers the chips of `activityAreas`.

/** The first part of an action: `minecraft` for `minecraft.ban`. */
export const AUDIT_AREAS = [
  'minecraft',
  'people',
  'events',
  'links',
  'site',
  'settings',
  'economy',
] as const;
export type AuditArea = (typeof AUDIT_AREAS)[number];

export function auditAreaOf(action: string): AuditArea {
  return action.split('.')[0] as AuditArea;
}

/**
 * The action prefixes a role may read, or null for all of them (site admins). A person with
 * several roles gets the union.
 */
export function activityPrefixes(role: string | null | undefined): string[] | null {
  if (isAdmin(role)) return null;
  const prefixes: string[] = [];
  if (isWardenAdmin(role)) prefixes.push('minecraft.');
  if (isEventsManager(role)) prefixes.push('events.', 'links.', 'people.ghost.');
  if (isEconomyAdmin(role)) prefixes.push('economy.');
  return prefixes;
}

/** The areas a role may filter by, in list order. */
export function activityAreas(role: string | null | undefined): AuditArea[] {
  const prefixes = activityPrefixes(role);
  if (!prefixes) return [...AUDIT_AREAS];
  return AUDIT_AREAS.filter((area) => prefixes.some((prefix) => prefix.split('.')[0] === area));
}

/** Whether a role may read an action. */
export function canReadAction(role: string | null | undefined, action: string): boolean {
  const prefixes = activityPrefixes(role);
  return !prefixes || prefixes.some((prefix) => action.startsWith(prefix));
}
