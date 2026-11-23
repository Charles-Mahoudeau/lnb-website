import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AUDIT_ACTIONS } from '../../shared/utils/audit-actions.ts';

// The coverage rule of docs/activity-log.md: every admin route that writes records an action. The
// map below says which, for every write route under an admin path. A new route that is not in it
// fails the first test, and an action it names must be in the code the route reaches.

const ROOT = join(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

/** Route file (without `server/api/` and `.ts`) to its actions, or the reason it records none. */
const ROUTES: Record<string, string[] | string> = {
  'admin/api-keys/[id]/revoke.post': ['settings.apiKey.revoke'],
  'admin/api-keys/[id]/rotate.post': ['settings.apiKey.rotate'],
  'admin/api-keys/index.post': ['settings.apiKey.create'],
  'admin/changelog/[id].patch': ['minecraft.changelog.update'],
  'admin/changelog/[id]/publish.post': ['minecraft.changelog.publish'],
  'admin/changelog/[id]/schedule.post': ['minecraft.changelog.schedule'],
  'admin/changelog/[id]/translate.post': ['minecraft.changelog.translate'],
  'admin/changelog/[id]/unpublish.post': ['minecraft.changelog.unpublish'],
  'admin/changelog/index.post': ['minecraft.changelog.create'],
  'admin/changelog/images.post':
    'Not audited: an upload changes nothing a reader sees until a post uses it (docs/changelog.md).',
  'admin/changelog/preview.post': 'Read-only: renders Markdown for the editor.',
  'admin/downloads/[slot].delete': ['minecraft.downloads.update'],
  'admin/downloads/[slot].put': ['minecraft.downloads.update'],
  'admin/downloads/index.patch': ['minecraft.downloads.update'],
  'admin/event-rooms/[id].patch': ['events.room.update'],
  'admin/event-rooms/index.post': ['events.room.create'],
  'admin/event-types/[id].patch': ['events.type.update'],
  'admin/event-types/index.post': ['events.type.create'],
  'admin/events/[id]/announce-resend.post': [
    'events.event.announceResend',
    'events.event.announce',
  ],
  'admin/events/[id]/announce.post': ['events.event.announceResend', 'events.event.announce'],
  'admin/events/[id]/bde-sync.post': ['events.event.bdeRetry'],
  'admin/events/[id]/cancel.post': ['events.event.cancel'],
  'admin/events/[id]/duplicate.post': ['events.event.create'],
  'admin/events/[id]/index.delete': ['events.event.delete'],
  'admin/events/[id]/index.put': ['events.event.update'],
  'admin/events/[id]/push-impact.post': 'Read-only: counts who would be notified.',
  'admin/events/[id]/registrations/[userId].delete': ['events.event.registrationRemove'],
  'admin/events/[id]/registrations/index.post': ['events.event.registrationAdd'],
  'admin/events/[id]/teams.post': ['events.team.create'],
  'admin/events/[id]/teams/[teamId].delete': ['events.team.delete'],
  'admin/events/[id]/teams/[teamId].patch': [
    'events.team.rename',
    'events.team.force',
    'events.team.captain',
  ],
  'admin/events/[id]/teams/[teamId]/members.post': ['events.team.memberAdd'],
  'admin/events/[id]/teams/[teamId]/members/[userId].delete': ['events.team.memberRemove'],
  'admin/events/images/import.post': ['events.image.add'],
  'admin/events/images/index.post': ['events.image.add'],
  'admin/events/index.post': ['events.event.create'],
  'admin/events/users/ghost.post': ['people.ghost.create'],
  'admin/files/[id].delete': ['minecraft.file.delete'],
  'admin/files/[id].patch': ['minecraft.file.kind'],
  'admin/files/index.post': ['minecraft.file.upload'],
  'admin/flags/[key].patch': ['settings.flag'],
  'admin/gamesplanet/pins.post': ['site.gamesplanet.pin'],
  'admin/gamesplanet/pins/[uid].delete': ['site.gamesplanet.unpin'],
  'admin/gamesplanet/pins/[uid]/move.post': ['site.gamesplanet.pinMove'],
  'admin/gamesplanet/settings.patch': ['site.gamesplanet.settings'],
  'admin/gamesplanet/sync.post': ['site.gamesplanet.sync'],
  'admin/map.patch': ['settings.map'],
  'admin/partner-events/[slug]/announce-impact.post': 'Read-only: counts who would be notified.',
  'admin/partner-events/[slug]/announce.post': ['events.partnerEvent.announce'],
  'admin/partner-events/[slug]/close.post': ['events.partnerEvent.close'],
  'admin/partner-events/[slug]/games/[game].patch': ['events.partnerEvent.update'],
  'admin/partner-events/[slug]/index.patch': ['events.partnerEvent.update'],
  'admin/partner-events/[slug]/reopen.post': ['events.partnerEvent.reopen'],
  'admin/partner-events/[slug]/teams/[teamId].delete': ['events.partnerEvent.update'],
  'admin/partner-events/[slug]/teams/[teamId].patch': ['events.partnerEvent.update'],
  'admin/partners/[id].delete': ['site.partner.delete'],
  'admin/partners/[id].patch': ['site.partner.update'],
  'admin/partners/[id]/move.post': ['site.partner.move'],
  'admin/partners/index.post': ['site.partner.create'],
  'admin/partners/logo.post': 'A pre-upload: saving the partner records site.partner.update.',
  'admin/partners/settings.patch': ['site.partners.settings'],
  'admin/posters/[id]/duplicate.post': ['events.poster.create'],
  'admin/posters/[id]/index.delete': ['events.poster.delete'],
  'admin/posters/[id]/index.put': ['events.poster.update'],
  'admin/posters/index.post': ['events.poster.create'],
  'admin/push/settings.patch': ['events.push.settings'],
  'admin/rate-limit/index.put': ['settings.rateLimit'],
  'admin/rules/[ruleId].patch': ['minecraft.rule.update'],
  'admin/rules/[ruleId]/move.post': ['minecraft.rule.move'],
  'admin/rules/[ruleId]/retired.put': ['minecraft.rule.retire', 'minecraft.rule.restore'],
  'admin/rules/categories/[categoryId].delete': ['minecraft.rule.categoryDelete'],
  'admin/rules/categories/[categoryId].patch': ['minecraft.rule.categoryUpdate'],
  'admin/rules/categories/[categoryId]/move.post': ['minecraft.rule.categoryMove'],
  'admin/rules/categories/index.post': ['minecraft.rule.categoryCreate'],
  'admin/rules/draft.post': ['minecraft.rule.seed'],
  'admin/rules/index.post': ['minecraft.rule.create'],
  'admin/short-links/[id].delete': ['links.delete'],
  'admin/short-links/[id].patch': ['links.update'],
  'admin/short-links/index.post': ['links.create'],
  'admin/team/members/[userId].delete': ['site.teamMember.remove'],
  'admin/team/members/[userId].patch': ['site.teamMember.update'],
  'admin/team/members/[userId]/move.post': ['site.teamMember.move'],
  'admin/team/members/index.post': ['site.teamMember.add'],
  'admin/team/poles/[id].delete': ['site.teamPole.delete'],
  'admin/team/poles/[id].patch': ['site.teamPole.update'],
  'admin/team/poles/[id]/move.post': ['site.teamPole.move'],
  'admin/team/poles/index.post': ['site.teamPole.create'],
  'admin/team/settings.patch': ['site.team.settings'],
  'admin/users/[userId]/ban.post': ['people.ban'],
  'admin/users/[userId]/ghost.patch': ['people.ghost.update'],
  'admin/users/[userId]/index.delete': ['people.delete'],
  'admin/users/[userId]/roles.put': ['people.roles'],
  'admin/users/[userId]/sign-out.post': ['people.signOut'],
  'admin/users/[userId]/unban.post': ['people.unban'],
  'admin/users/bulk.post': [
    'people.roles',
    'people.ban',
    'people.unban',
    'people.signOut',
    'people.delete',
  ],
  'admin/users/ghost.post': ['people.ghost.create'],
  'anticheat/admin/alerts/[id]/dismiss.post': ['minecraft.anticheat.alertDismiss'],
  'anticheat/admin/files/[sha512]/decision.post': [
    'minecraft.anticheat.approve',
    'minecraft.anticheat.ban',
    'minecraft.anticheat.clear',
  ],
  'anticheat/admin/files/[sha512]/notes.post': ['minecraft.anticheat.note'],
  'anticheat/admin/files/[sha512]/players/bulk.post': ['minecraft.anticheat.bulk'],
  'anticheat/admin/files/[sha512]/rescore.post': ['minecraft.anticheat.rescore'],
  'anticheat/admin/files/[sha512]/reviewed.post': ['minecraft.anticheat.reviewed'],
  'anticheat/admin/mod-id-bans/[modId].delete': ['minecraft.anticheat.modIdUnban'],
  'anticheat/admin/mod-id-bans/index.post': ['minecraft.anticheat.modIdBan'],
  'anticheat/admin/players/[userId]/hold.post': [
    'minecraft.anticheat.hold',
    'minecraft.anticheat.holdClear',
  ],
  'anticheat/admin/players/[userId]/score.post': ['minecraft.anticheat.playerAdjust'],
  'anticheat/admin/projects/[id]/decision.post': [
    'minecraft.anticheat.approve',
    'minecraft.anticheat.ban',
    'minecraft.anticheat.clear',
  ],
  'anticheat/admin/projects/[id]/link.post': ['minecraft.anticheat.link'],
  'anticheat/admin/projects/[id]/unlink.post': ['minecraft.anticheat.unlink'],
  'anticheat/admin/projects/index.post': [
    'minecraft.anticheat.approve',
    'minecraft.anticheat.ban',
    'minecraft.anticheat.clear',
  ],
  'anticheat/admin/rescore.post': ['minecraft.anticheat.rescore'],
  'anticheat/admin/reset-files.post': ['minecraft.anticheat.resetFiles'],
  'anticheat/admin/reset-sanctions.post': ['minecraft.anticheat.resetSanctions'],
  'anticheat/admin/settings.patch': ['minecraft.anticheat.settings'],
  'economy/admin/accounts/[accountId]/adjustments.post': ['economy.adjust'],
  'economy/admin/accounts/[accountId]/freeze.post': ['economy.freeze', 'economy.unfreeze'],
  'economy/admin/accounts/[accountId]/index.patch': ['economy.accountType'],
  'economy/admin/accounts/[accountId]/licenses/index.delete': ['economy.licenseRevoke'],
  'economy/admin/accounts/[accountId]/licenses/index.post': ['economy.licenseGrant'],
  'economy/admin/listings/[listingId]/remove.post': ['economy.listingRemove'],
  'economy/admin/reset.post': ['economy.reset'],
  'economy/admin/settings.patch': ['economy.settings'],
  'economy/admin/shops/[shopId].patch': ['economy.shopDisable', 'economy.shopEnable'],
  'economy/admin/transactions/[transactionId]/reverse.post': ['economy.reverse'],
  'minecraft/admin/modpack/export.post': ['minecraft.modpack.export'],
  'minecraft/admin/modpack/mods/[id]/adopt.post': ['minecraft.modpack.adopt'],
  'minecraft/admin/modpack/mods/[id]/file.put': ['minecraft.modpack.pin'],
  'minecraft/admin/modpack/mods/[id]/index.delete': ['minecraft.modpack.remove'],
  'minecraft/admin/modpack/mods/[id]/index.patch': ['minecraft.modpack.edit'],
  'minecraft/admin/modpack/mods/adopt-all.post': ['minecraft.modpack.adopt'],
  'minecraft/admin/modpack/mods/check.post': ['minecraft.modpack.check'],
  'minecraft/admin/modpack/mods/index.post': ['minecraft.modpack.add'],
  'minecraft/admin/modpack/retired/[id]/index.delete': ['minecraft.modpack.retire.remove'],
  'minecraft/admin/modpack/retired/[id]/index.patch': ['minecraft.modpack.retire.edit'],
  'minecraft/admin/modpack/retired/index.post': ['minecraft.modpack.retire'],
  'minecraft/admin/modpack/tools/[tool].put': ['minecraft.modpack.tool'],
  'minecraft/admin/mods/[id]/convert.post': ['minecraft.mod.convert'],
  'minecraft/admin/mods/[id]/index.delete': ['minecraft.mod.delete'],
  'minecraft/admin/mods/[id]/index.patch': ['minecraft.mod.edit'],
  'minecraft/admin/mods/[id]/promote.post': ['minecraft.mod.promote'],
  'minecraft/admin/mods/[id]/refresh.post': ['minecraft.mod.refresh'],
  'minecraft/admin/mods/[id]/remove.post': ['minecraft.mod.remove'],
  'minecraft/admin/mods/[id]/restore.post': ['minecraft.mod.restore'],
  'minecraft/admin/mods/index.post': ['minecraft.mod.add'],
  'minecraft/admin/settings.patch': ['minecraft.modSettings.update'],
  'playtime/admin/closures/[id].delete': ['minecraft.playtime.closure'],
  'playtime/admin/closures/[id].patch': ['minecraft.playtime.closure'],
  'playtime/admin/closures/index.post': ['minecraft.playtime.closure'],
  'playtime/admin/closures/skip-week.post': ['minecraft.playtime.closure'],
  'playtime/admin/players/[userId]/exemptions/[id].delete': ['minecraft.playtime.exemption'],
  'playtime/admin/players/[userId]/exemptions/index.post': ['minecraft.playtime.exemption'],
  'playtime/admin/players/[userId]/grants/[id].delete': ['minecraft.playtime.grant'],
  'playtime/admin/players/[userId]/grants/index.post': ['minecraft.playtime.grant'],
  'playtime/admin/players/[userId]/overrides.put': ['minecraft.playtime.settings'],
  'playtime/admin/reset-all.post': ['minecraft.playtime.resetAll'],
  'playtime/admin/reset.post': ['minecraft.playtime.reset', 'minecraft.playtime.resetAll'],
  'playtime/admin/schools/[tenantId].delete': ['minecraft.playtime.school'],
  'playtime/admin/schools/[tenantId].put': ['minecraft.playtime.school'],
  'playtime/admin/settings.patch': ['minecraft.playtime.settings'],
  'economy/admin/market/items/[id].patch': ['economy.market.itemUpdate'],
  'economy/admin/market/items/[id]/reset-stock.post': ['economy.market.itemResetStock'],
  'economy/admin/market/items/index.post': ['economy.market.itemCreate'],
  'economy/admin/market/accepted-loops/[id].delete': ['economy.market.loopRevoke'],
  'economy/admin/market/accepted-loops/index.post': ['economy.market.loopAccept'],
  'economy/admin/market/settings.patch': ['economy.market.settings'],
  'economy/admin/market/validate.post': 'Read-only: runs the loop validator.',
  'quests/admin/categories/[family]/[id].delete': ['economy.quests.categoryDelete'],
  'quests/admin/categories/[family]/[id].patch': ['economy.quests.categoryUpdate'],
  'quests/admin/categories/index.post': ['economy.quests.categoryCreate'],
  'quests/admin/community/[id].patch': ['economy.quests.communityUpdate'],
  'quests/admin/community/[id]/cancel.post': ['economy.quests.communityCancel'],
  'quests/admin/community/index.post': ['economy.quests.communityCreate'],
  'quests/admin/community/templates.post': ['economy.quests.communityTemplate'],
  'quests/admin/import.post': ['economy.quests.import'],
  'quests/admin/quests/[id].delete': ['economy.quests.delete'],
  'quests/admin/quests/[id].patch': ['economy.quests.update'],
  'quests/admin/quests/index.post': ['economy.quests.create'],
  'quests/admin/reset.post': ['economy.quests.reset'],
  'quests/admin/settings.patch': ['economy.quests.settings'],
  'warden/admin/appeals/[id]/decision.post': ['minecraft.appeal.decide'],
  'warden/admin/bans/[banId].patch': ['minecraft.ban.update'],
  'warden/admin/bans/[banId]/revoke.post': ['minecraft.unban'],
  'warden/admin/players/[userId]/accounts/[uuid].delete': ['minecraft.unlink'],
  'warden/admin/players/[userId]/bans.post': ['minecraft.ban'],
  'warden/admin/players/[userId]/devices/[deviceId].delete': ['minecraft.device.revoke'],
  'warden/admin/players/[userId]/index.patch': ['minecraft.limit.set'],
  'warden/admin/players/[userId]/notes.post': ['minecraft.warning.create', 'minecraft.note.create'],
  'warden/admin/players/[userId]/role.put': ['minecraft.role.set'],
  'warden/admin/reset-sanctions.post': ['minecraft.resetSanctions'],
  'warden/admin/settings.patch': ['minecraft.settings.update'],
  'warden/admin/transfers/[transferId]/dismiss.post': ['minecraft.transfer.dismiss'],
};

/** Actions no admin route writes, with where they come from. */
const OTHER_ORIGINS: Record<string, string> = {
  'minecraft.link': 'the Minecraft account link, by the player',
  'minecraft.link.request': 'legacy: manual link codes, no longer written',
  'minecraft.link.cancel': 'legacy: manual link codes, no longer written',
  'minecraft.link.transfer': 'the player, taking over an account',
  'minecraft.token.rotate': 'legacy: new addresses, no longer written',
  'minecraft.device.link': 'the player, linking a launcher',
  'minecraft.device.deny': 'the player, refusing a launcher',
  'minecraft.ban.expire': 'legacy: bans end by their date, no longer written',
  'minecraft.appeal.create': 'the player, appealing a ban',
  'minecraft.identity.update': 'the Minecraft server',
  'minecraft.uuid.collision': 'legacy: no longer written',
  'minecraft.anticheat.verdict': 'the anticheat, as a verdict changes',
  'minecraft.anticheat.alert': 'the anticheat, as an alert is raised',
  'minecraft.playtime.warning': 'the playtime enforcement',
  'minecraft.playtime.grace': 'the playtime enforcement',
  'minecraft.playtime.update': 'the playtime enforcement',
  'minecraft.playtime.kick': 'the playtime enforcement',
  'economy.market.recipes': 'the Minecraft server, sending its recipes',
  'minecraft.feed.delete':
    'Feed: a moderator deleting a post in game (the admin route comes with the moderation tab)',
  'minecraft.feed.pin': 'Feed: an announcer pinning, in game or on the Feed page',
  'minecraft.feed.unpin': 'Feed: an announcer unpinning, in game or on the Feed page',
  'minecraft.feed.announcer':
    'Feed: /feed announcer in game (the admin route comes with the moderation tab)',
  'people.ghost.claim': 'the first sign-in of a person with a ghost account',
  'events.partnerEvent.export': 'a GET route, which downloads personal data',
  'links.export': 'a GET route, which downloads personal data',
};

/** Scheduled tasks: the action they record, or why they record none. */
const TASKS: Record<string, string> = {
  'anticheat/lookups': 'Frequent: refreshes lookups, nothing a person decided.',
  'anticheat/prune': 'minecraft.anticheat.prune',
  'anticheat/rescore': 'minecraft.anticheat.rescore',
  'api-keys/prune': 'settings.apiKey.prune',
  'audit/prune': 'settings.activityPrune',
  'economy/snapshot': 'economy.sweep',
  'changelog/publish-scheduled': 'minecraft.changelog.publish',
  'market/prune': 'economy.market.prune',
  'market/snapshot': 'Frequent: hourly price history, nothing a person decided.',
  'events/bde-sync': 'Frequent: syncs with the BDE website.',
  'events/prune-images': 'events.pruneImages',
  'gamesplanet/prune-covers': 'site.gamesplanet.prune',
  'gamesplanet/sync-catalog': 'site.gamesplanet.sync',
  'gamesplanet/sync-deals': 'Frequent: refreshes the deals.',
  'minecraft/prune-events': 'minecraft.events.prune',
  'modpack/check-latest': 'minecraft.modpack.check',
  'partner-events/purge': 'events.partnerEvent.purge',
  'partners/prune-logos': 'site.prunePartnerLogos',
  'playtime/prune': 'minecraft.playtime.prune',
  'push/deliver': 'Frequent: sends the queue.',
  'push/prune': 'events.push.prune',
  'quests/community': 'Frequent: settles community goals.',
  'quests/index': 'economy.quests.index',
  'users/delete-inactive': 'people.deleteInactive',
  'users/prune-avatars': 'people.pruneAvatars',
  'warden/close-stale-sessions': 'Frequent: closes sessions.',
};

function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(ROOT, path)).isDirectory() ? files(path) : [path];
  });
}

/** The file and the server modules it imports, a few levels down. */
function reachable(file: string, depth = 4, seen = new Set<string>()): Set<string> {
  if (seen.has(file) || depth < 0 || !existsSync(join(ROOT, file))) return seen;
  seen.add(file);
  for (const match of read(file).matchAll(/from '([^']+)'/g)) {
    const spec = match[1]!;
    const base = spec.startsWith('~~/')
      ? spec.slice(3)
      : spec.startsWith('.')
        ? join(dirname(file), spec)
        : null;
    if (!base) continue;
    for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
      if (existsSync(join(ROOT, candidate))) reachable(candidate, depth - 1, seen);
    }
  }
  return seen;
}

const mentions = (file: string, action: string) =>
  [...reachable(file)].some((path) => read(path).includes(`'${action}'`));

describe('activity log coverage', () => {
  const writes = files('server/api')
    .filter((file) => /^server\/api\/(admin|.*\/admin)\//.test(file))
    .filter((file) => /\.(post|put|patch|delete)\.ts$/.test(file))
    .map((file) => file.slice('server/api/'.length, -'.ts'.length))
    .sort();

  it('lists every admin write route, and only those', () => {
    expect(Object.keys(ROUTES).sort()).toEqual(writes);
  });

  it('names only actions that exist', () => {
    const known = new Set<string>(AUDIT_ACTIONS);
    for (const [route, actions] of Object.entries(ROUTES)) {
      if (typeof actions === 'string') continue;
      for (const action of actions) expect(known.has(action), `${route}: ${action}`).toBe(true);
    }
  });

  it('finds each named action in the code its route reaches', () => {
    for (const [route, actions] of Object.entries(ROUTES)) {
      if (typeof actions === 'string') continue;
      expect(actions.length, route).toBeGreaterThan(0);
      for (const action of actions) {
        expect(mentions(`server/api/${route}.ts`, action), `${route}: ${action}`).toBe(true);
      }
    }
  });

  it('accounts for every action: a route, a task or another origin', () => {
    const fromRoutes = new Set(
      Object.values(ROUTES).flatMap((value) => (Array.isArray(value) ? value : [])),
    );
    const fromTasks = new Set(Object.values(TASKS).filter((value) => /^[a-z]+\./.test(value)));
    const missing = AUDIT_ACTIONS.filter(
      (action) => !fromRoutes.has(action) && !fromTasks.has(action) && !(action in OTHER_ORIGINS),
    );
    expect(missing).toEqual([]);
    for (const action of Object.keys(OTHER_ORIGINS)) {
      expect(AUDIT_ACTIONS as readonly string[], action).toContain(action);
    }
  });

  it('writes every action that is not legacy somewhere in the server', () => {
    const source = files('server')
      .filter((file) => file.endsWith('.ts') && !file.startsWith('server/db/'))
      .map(read)
      .join('\n');
    for (const action of AUDIT_ACTIONS) {
      if (OTHER_ORIGINS[action]?.startsWith('legacy')) continue;
      expect(source.includes(`'${action}'`), action).toBe(true);
    }
  });

  it('lists every scheduled task, and each records its action', () => {
    const tasks = files('server/tasks')
      .map((file) => file.slice('server/tasks/'.length, -'.ts'.length))
      .sort();
    expect(Object.keys(TASKS).sort()).toEqual(tasks);
    for (const [task, value] of Object.entries(TASKS)) {
      if (!/^[a-z]+\./.test(value)) continue;
      expect(mentions(`server/tasks/${task}.ts`, value), `${task}: ${value}`).toBe(true);
    }
  });
});
