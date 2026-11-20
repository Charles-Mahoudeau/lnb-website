import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigration, databaseBefore } from './migrations.ts';
import { AUDIT_ACTIONS } from '../../shared/utils/audit-actions.ts';

// 0057 merges warden_audit and admin_audit into one audit table (docs/activity-log.md): the rows
// keep their order and their people, the actions get their new names, and the sources are renamed.

const MIGRATION = '0057_activity_log';

/** Old action of warden_audit, and its name in audit. */
const WARDEN: [string, string][] = [
  ['link', 'minecraft.link'],
  ['link.request', 'minecraft.link.request'],
  ['link.cancel', 'minecraft.link.cancel'],
  ['unlink', 'minecraft.unlink'],
  ['link.transfer', 'minecraft.link.transfer'],
  ['transfer.dismiss', 'minecraft.transfer.dismiss'],
  ['token.rotate', 'minecraft.token.rotate'],
  ['device.link', 'minecraft.device.link'],
  ['device.deny', 'minecraft.device.deny'],
  ['device.revoke', 'minecraft.device.revoke'],
  ['ban', 'minecraft.ban'],
  ['unban', 'minecraft.unban'],
  ['ban.expire', 'minecraft.ban.expire'],
  ['ban.update', 'minecraft.ban.update'],
  ['appeal.create', 'minecraft.appeal.create'],
  ['appeal.decide', 'minecraft.appeal.decide'],
  ['note.create', 'minecraft.note.create'],
  ['warning.create', 'minecraft.warning.create'],
  ['limit.set', 'minecraft.limit.set'],
  ['role.set', 'minecraft.role.set'],
  ['settings.update', 'minecraft.settings.update'],
  ['identity.update', 'minecraft.identity.update'],
  ['uuid.collision', 'minecraft.uuid.collision'],
  ['mod.add', 'minecraft.mod.add'],
  ['mod.promote', 'minecraft.mod.promote'],
  ['mod.edit', 'minecraft.mod.edit'],
  ['mod.convert', 'minecraft.mod.convert'],
  ['mod.refresh', 'minecraft.mod.refresh'],
  ['mod.remove', 'minecraft.mod.remove'],
  ['mod.restore', 'minecraft.mod.restore'],
  ['mod.delete', 'minecraft.mod.delete'],
  ['modSettings.update', 'minecraft.modSettings.update'],
  ['file.upload', 'minecraft.file.upload'],
  ['file.delete', 'minecraft.file.delete'],
  ['file.kind', 'minecraft.file.kind'],
  ['modpack.add', 'minecraft.modpack.add'],
  ['modpack.edit', 'minecraft.modpack.edit'],
  ['modpack.pin', 'minecraft.modpack.pin'],
  ['modpack.adopt', 'minecraft.modpack.adopt'],
  ['modpack.export', 'minecraft.modpack.export'],
  ['modpack.remove', 'minecraft.modpack.remove'],
  ['modpack.tool', 'minecraft.modpack.tool'],
  ['anticheat.approve', 'minecraft.anticheat.approve'],
  ['anticheat.ban', 'minecraft.anticheat.ban'],
  ['anticheat.clear', 'minecraft.anticheat.clear'],
  ['anticheat.reviewed', 'minecraft.anticheat.reviewed'],
  ['anticheat.link', 'minecraft.anticheat.link'],
  ['anticheat.unlink', 'minecraft.anticheat.unlink'],
  ['anticheat.modIdBan', 'minecraft.anticheat.modIdBan'],
  ['anticheat.modIdUnban', 'minecraft.anticheat.modIdUnban'],
  ['anticheat.playerAdjust', 'minecraft.anticheat.playerAdjust'],
  ['anticheat.hold', 'minecraft.anticheat.hold'],
  ['anticheat.holdClear', 'minecraft.anticheat.holdClear'],
  ['anticheat.bulk', 'minecraft.anticheat.bulk'],
  ['anticheat.settings', 'minecraft.anticheat.settings'],
  ['anticheat.verdict', 'minecraft.anticheat.verdict'],
  ['anticheat.alert', 'minecraft.anticheat.alert'],
  ['anticheat.resetFiles', 'minecraft.anticheat.resetFiles'],
  ['anticheat.resetSanctions', 'minecraft.anticheat.resetSanctions'],
  ['playtime.settings', 'minecraft.playtime.settings'],
  ['playtime.school', 'minecraft.playtime.school'],
  ['playtime.closure', 'minecraft.playtime.closure'],
  ['playtime.exemption', 'minecraft.playtime.exemption'],
  ['playtime.grant', 'minecraft.playtime.grant'],
  ['playtime.reset', 'minecraft.playtime.reset'],
  ['playtime.resetAll', 'minecraft.playtime.resetAll'],
  ['warden.resetSanctions', 'minecraft.resetSanctions'],
  ['playtime.warning', 'minecraft.playtime.warning'],
  ['playtime.grace', 'minecraft.playtime.grace'],
  ['playtime.update', 'minecraft.playtime.update'],
  ['playtime.kick', 'minecraft.playtime.kick'],
];

/** Old action of admin_audit, and its name in audit. */
const ADMIN: [string, string][] = [
  ['user.roles', 'people.roles'],
  ['user.ban', 'people.ban'],
  ['user.unban', 'people.unban'],
  ['user.signOut', 'people.signOut'],
  ['user.delete', 'people.delete'],
  ['user.ghostCreate', 'people.ghost.create'],
  ['user.ghostUpdate', 'people.ghost.update'],
  ['user.ghostClaim', 'people.ghost.claim'],
  ['flag.update', 'settings.flag'],
  ['rateLimit.mode', 'settings.rateLimit'],
  ['users.deleteInactive', 'people.deleteInactive'],
  ['event.create', 'events.event.create'],
  ['event.update', 'events.event.update'],
  ['event.cancel', 'events.event.cancel'],
  ['event.delete', 'events.event.delete'],
  ['event.announce', 'events.event.announce'],
  ['event.announceResend', 'events.event.announceResend'],
  ['event.registrationAdd', 'events.event.registrationAdd'],
  ['event.registrationRemove', 'events.event.registrationRemove'],
  ['eventTeam.create', 'events.team.create'],
  ['eventTeam.rename', 'events.team.rename'],
  ['eventTeam.delete', 'events.team.delete'],
  ['eventTeam.memberAdd', 'events.team.memberAdd'],
  ['eventTeam.memberRemove', 'events.team.memberRemove'],
  ['eventTeam.captain', 'events.team.captain'],
  ['eventTeam.force', 'events.team.force'],
  ['eventRoom.create', 'events.room.create'],
  ['eventRoom.update', 'events.room.update'],
  ['eventType.create', 'events.type.create'],
  ['eventType.update', 'events.type.update'],
  ['push.settings', 'events.push.settings'],
  ['teamPole.create', 'site.teamPole.create'],
  ['teamPole.update', 'site.teamPole.update'],
  ['teamPole.delete', 'site.teamPole.delete'],
  ['teamMember.add', 'site.teamMember.add'],
  ['teamMember.update', 'site.teamMember.update'],
  ['teamMember.remove', 'site.teamMember.remove'],
  ['team.settings', 'site.team.settings'],
  ['partner.create', 'site.partner.create'],
  ['partner.update', 'site.partner.update'],
  ['partner.delete', 'site.partner.delete'],
  ['map.settings', 'settings.map'],
  ['downloads.update', 'minecraft.downloads.update'],
  ['rule.create', 'minecraft.rule.create'],
  ['rule.update', 'minecraft.rule.update'],
  ['rule.retire', 'minecraft.rule.retire'],
  ['rule.restore', 'minecraft.rule.restore'],
  ['rule.categoryCreate', 'minecraft.rule.categoryCreate'],
  ['rule.categoryUpdate', 'minecraft.rule.categoryUpdate'],
  ['rule.categoryDelete', 'minecraft.rule.categoryDelete'],
  ['rule.seed', 'minecraft.rule.seed'],
  ['partners.settings', 'site.partners.settings'],
  ['gamesplanet.settings', 'site.gamesplanet.settings'],
  ['gamesplanet.pin', 'site.gamesplanet.pin'],
  ['gamesplanet.unpin', 'site.gamesplanet.unpin'],
  ['gamesplanet.sync', 'site.gamesplanet.sync'],
  ['partnerEvent.update', 'events.partnerEvent.update'],
  ['partnerEvent.close', 'events.partnerEvent.close'],
  ['partnerEvent.reopen', 'events.partnerEvent.reopen'],
  ['partnerEvent.export', 'events.partnerEvent.export'],
  ['partnerEvent.announce', 'events.partnerEvent.announce'],
  ['partnerEvent.purge', 'events.partnerEvent.purge'],
  ['shortLink.create', 'links.create'],
  ['shortLink.update', 'links.update'],
  ['shortLink.delete', 'links.delete'],
  ['shortLink.export', 'links.export'],
  ['apiKey.create', 'settings.apiKey.create'],
  ['apiKey.rotate', 'settings.apiKey.rotate'],
  ['apiKey.revoke', 'settings.apiKey.revoke'],
  ['poster.create', 'events.poster.create'],
  ['poster.update', 'events.poster.update'],
  ['poster.delete', 'events.poster.delete'],
  ['economy.adjust', 'economy.adjust'],
  ['economy.freeze', 'economy.freeze'],
  ['economy.unfreeze', 'economy.unfreeze'],
  ['economy.reverse', 'economy.reverse'],
  ['economy.settings', 'economy.settings'],
  ['economy.reset', 'economy.reset'],
  ['economy.shopDisable', 'economy.shopDisable'],
  ['economy.shopEnable', 'economy.shopEnable'],
  ['economy.listingRemove', 'economy.listingRemove'],
  ['economy.accountType', 'economy.accountType'],
  ['economy.licenseGrant', 'economy.licenseGrant'],
  ['economy.licenseRevoke', 'economy.licenseRevoke'],
  ['quests.settings', 'economy.quests.settings'],
  ['quests.create', 'economy.quests.create'],
  ['quests.update', 'economy.quests.update'],
  ['quests.delete', 'economy.quests.delete'],
  ['quests.import', 'economy.quests.import'],
  ['quests.reset', 'economy.quests.reset'],
  ['quests.communityCreate', 'economy.quests.communityCreate'],
  ['quests.communityUpdate', 'economy.quests.communityUpdate'],
  ['quests.communityCancel', 'economy.quests.communityCancel'],
  ['quests.communityTemplate', 'economy.quests.communityTemplate'],
  ['quests.categoryCreate', 'economy.quests.categoryCreate'],
  ['quests.categoryUpdate', 'economy.quests.categoryUpdate'],
  ['quests.categoryDelete', 'economy.quests.categoryDelete'],
];

let pool: pg.Pool;

beforeAll(async () => {
  pool = await databaseBefore('lnb_test_activity_log', MIGRATION);
  await pool.query(
    `INSERT INTO "user" (id, name, email, tenant_id) VALUES ('u1', 'One', 'one@epitech.eu', 't')`,
  );
  const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString();
  // Interleaved in time, so the new order is by time and not by table.
  let minute = 0;
  for (const [action] of WARDEN) {
    const source = minute % 2 ? 'web' : 'minecraft';
    await pool.query(
      `INSERT INTO warden_audit (at, action, source, actor_user_id, target_user_id, data) VALUES ($1, $2, $3, 'u1', 'u1', '{"w":true}')`,
      [at(minute * 2), action, source],
    );
    minute++;
  }
  minute = 0;
  for (const [action] of ADMIN) {
    await pool.query(
      `INSERT INTO admin_audit (at, action, actor_user_id, target_user_id, data) VALUES ($1, $2, $3, NULL, '{}')`,
      [at(minute * 2 + 1), action, minute % 2 ? 'u1' : null],
    );
    minute++;
  }
  await applyMigration(pool, MIGRATION);
});

afterAll(async () => {
  await pool.end();
});

describe('activity log migration', () => {
  it('copies every row and drops the old tables', async () => {
    const { rows } = await pool.query<{ count: string }>('SELECT count(*) FROM audit');
    expect(Number(rows[0]!.count)).toBe(WARDEN.length + ADMIN.length);
    const gone = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name IN ('warden_audit', 'admin_audit')`,
    );
    expect(gone.rowCount).toBe(0);
  });

  it('gives every old action its new name, and only names that exist', async () => {
    const { rows } = await pool.query<{ action: string }>('SELECT action FROM audit');
    const names = new Set(rows.map((row) => row.action));
    for (const [, name] of [...WARDEN, ...ADMIN]) expect(names.has(name), name).toBe(true);
    for (const name of names) expect(AUDIT_ACTIONS as readonly string[], name).toContain(name);
  });

  it('keeps the rows in time order, interleaving the two tables', async () => {
    const { rows } = await pool.query<{ id: string; at: Date; action: string }>(
      'SELECT id, at, action FROM audit ORDER BY id',
    );
    const times = rows.map((row) => row.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(rows[0]!.action).toBe(WARDEN[0]![1]);
    expect(rows[1]!.action).toBe(ADMIN[0]![1]);
  });

  it('renames the sources and marks jobs as system', async () => {
    const warden = await pool.query<{ source: string; n: string }>(
      `SELECT source, count(*) AS n FROM audit WHERE data = '{"w":true}' GROUP BY source`,
    );
    expect(warden.rows.map((row) => row.source).sort()).toEqual(['server', 'site']);
    const admin = await pool.query<{ source: string; actor_user_id: string | null }>(
      `SELECT source, actor_user_id FROM audit WHERE data = '{}'`,
    );
    for (const row of admin.rows) {
      expect(row.source).toBe(row.actor_user_id ? 'site' : 'system');
    }
  });

  it('continues the numbering after the copied rows', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO audit (action) VALUES ('minecraft.ban') RETURNING id`,
    );
    expect(Number(rows[0]!.id)).toBe(WARDEN.length + ADMIN.length + 1);
  });

  it('keeps a row when its account is deleted, with the user IDs emptied', async () => {
    await pool.query(`DELETE FROM "user" WHERE id = 'u1'`);
    const { rows } = await pool.query<{ n: string }>(
      'SELECT count(*) AS n FROM audit WHERE target_user_id IS NOT NULL OR actor_user_id IS NOT NULL',
    );
    expect(Number(rows[0]!.n)).toBe(0);
    const total = await pool.query<{ n: string }>('SELECT count(*) AS n FROM audit');
    expect(Number(total.rows[0]!.n)).toBe(WARDEN.length + ADMIN.length + 1);
  });
});
