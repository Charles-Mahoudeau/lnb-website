<script setup lang="ts">
import type { AdminPersonSummary } from '#shared/schemas/admin';

// The Summary tab of the Person page, "At a glance" (docs/design.md): one raised section with a row
// per area the role may see, each with an icon button to its tab, then the account facts. The
// server leaves out what the role can't read, so a missing block is a missing row.
const props = defineProps<{ summary: AdminPersonSummary }>();
const { t, locale } = useI18n();
const { user: me } = useAuth();

const base = computed(() => `/admin/people/${props.summary.userId}`);
const tabs = computed(
  () => new Set(personTabs(me.value?.role, props.summary.ghost).map((tab) => tab.id)),
);

interface Row {
  id: string;
  label: string;
  value: string;
  warning?: boolean;
}

const rows = computed<Row[]>(() => {
  const s = props.summary;
  const list: Row[] = [];
  if (s.minecraft) {
    const m = s.minecraft;
    const parts = m.accounts.length
      ? [
          m.accounts.map((account) => account.username).join(', '),
          t('admin.person.summary.accountsUsed', { used: m.limit.used, max: m.limit.max }),
          formatWardenDuration(m.playtimeSeconds, locale.value),
        ]
      : [t('admin.person.summary.noAccounts')];
    if (m.pendingTransfers) {
      parts.push(t('admin.person.summary.transfers', m.pendingTransfers));
    }
    list.push({
      id: 'minecraft',
      label: t('admin.person.tabs.minecraft'),
      value: parts.join(', '),
      warning: m.pendingTransfers > 0,
    });
  }
  if (s.moderation) {
    const m = s.moderation;
    const counts = [
      t('admin.person.summary.bans', m.bans),
      t('admin.person.summary.warnings', m.warnings),
      t('admin.person.summary.notes', m.notes),
    ].join(', ');
    const head = m.activeBan
      ? m.activeBan.expiresAt
        ? t('admin.users.bannedUntil', {
            date: formatWardenDate(m.activeBan.expiresAt, locale.value),
          })
        : t('wardenAdmin.players.banned')
      : t('admin.person.summary.notBanned');
    list.push({
      id: 'moderation',
      label: t('admin.person.tabs.moderation'),
      value: `${head}, ${counts}`,
      warning: m.activeBan !== null,
    });
  }
  if (s.playtime) {
    const over = s.playtime.overSeconds;
    list.push({
      id: 'playtime',
      label: t('admin.person.tabs.playtime'),
      value:
        over > 0
          ? t('admin.person.summary.overLimit', {
              time: formatWardenDuration(over, locale.value),
            })
          : t('admin.person.summary.underLimit'),
      warning: over > 0,
    });
  }
  if (s.anticheat !== undefined) {
    const a = s.anticheat;
    list.push({
      id: 'anticheat',
      label: t('admin.person.tabs.anticheat'),
      value: a
        ? [
            t('admin.person.summary.score', { score: a.score }),
            t(`admin.person.summary.band.${a.band}`),
            ...(a.manualHold ? [t('admin.person.summary.hold')] : []),
            t('admin.person.summary.flaggedFiles', a.flaggedFiles),
          ].join(', ')
        : t('admin.person.summary.unseen'),
      warning: a?.flagged === true,
    });
  }
  if (s.economy !== undefined) {
    list.push({
      id: 'lnbits',
      label: t('admin.person.tabs.lnbits'),
      value: s.economy
        ? t('admin.people.lnbits', { n: formatLnbits(s.economy.balance, locale.value) }) +
          (s.economy.frozen ? `, ${t('economy.accounts.frozen')}` : '')
        : t('admin.person.lnbits.none'),
    });
  }
  if (s.events) {
    list.push({
      id: 'events',
      label: t('admin.person.tabs.events'),
      value: t('admin.person.summary.registrations', s.events.registrations.length),
    });
  }
  return list;
});

const flags = computed(() => {
  const roles = props.summary.roles;
  if (!roles) return [];
  return [
    roles.admin && t('admin.roles.admin'),
    roles.wardenAdmin && t('admin.roles.wardenAdmin'),
    roles.eventsManager && t('admin.roles.eventsManager'),
    roles.economyAdmin && t('admin.roles.economyAdmin'),
  ].filter(Boolean) as string[];
});
</script>

<template>
  <div class="flex flex-col gap-8">
    <ul
      v-if="rows.length"
      class="flex flex-col divide-y divide-default rounded-lg bg-elevated"
      :aria-label="t('admin.person.summary.glance')"
    >
      <li v-for="row in rows" :key="row.id" class="flex items-center gap-4 px-5 py-3">
        <span class="w-28 shrink-0 text-muted">{{ row.label }}</span>
        <span class="min-w-0 flex-1" :class="row.warning ? 'text-warning' : 'text-highlighted'">
          {{ row.value }}
        </span>
        <UButton
          v-if="tabs.has(row.id)"
          :to="`${base}/${row.id}`"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-right"
          :aria-label="t('admin.person.summary.openTab', { tab: row.label })"
        />
      </li>
    </ul>

    <dl class="grid max-w-xl grid-cols-3 gap-x-6 gap-y-2 text-sm">
      <dt class="text-muted">{{ t('admin.users.school') }}</dt>
      <dd class="col-span-2 text-highlighted">
        {{ summary.school ?? t('admin.users.unknownSchool') }}
      </dd>
      <template v-if="summary.email">
        <dt class="text-muted">{{ t('admin.ghost.email') }}</dt>
        <dd class="col-span-2 break-all text-highlighted">{{ summary.email }}</dd>
      </template>
      <dt class="text-muted">{{ t('admin.person.account.created') }}</dt>
      <dd class="col-span-2 text-highlighted">{{ formatWardenDate(summary.createdAt, locale) }}</dd>
      <template v-if="summary.lastSignInAt !== undefined">
        <dt class="text-muted">{{ t('admin.users.lastSignIn') }}</dt>
        <dd class="col-span-2 text-highlighted">
          {{
            summary.lastSignInAt
              ? formatWardenRelative(summary.lastSignInAt, locale)
              : summary.ghost
                ? t('admin.ghost.neverSignedIn')
                : t('admin.users.never')
          }}
        </dd>
      </template>
      <template v-if="summary.roles">
        <dt class="text-muted">{{ t('admin.users.roles') }}</dt>
        <dd class="col-span-2 text-highlighted">
          {{ flags.length ? flags.join(', ') : t('admin.users.noRole') }}
        </dd>
      </template>
    </dl>
  </div>
</template>
