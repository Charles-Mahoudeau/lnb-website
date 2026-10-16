<script setup lang="ts">
import { flagMessageKey } from '#shared/flags';
import type { FlagKey } from '#shared/flags';
import type { AdminAuditView, AdminRolesBody } from '#shared/schemas/admin';

// The Overview: what needs an admin, then the latest admin changes. Counts only for things to
// handle, never usage figures (no internal analytics).
const { t, locale } = useI18n();
const { data, error } = await useAdminOverview();

interface Attention {
  key: string;
  icon: string;
  warning: boolean;
  title: string;
  detail: string;
  to: string;
  action: string;
}

const attention = computed<Attention[]>(() => {
  const overview = data.value;
  if (!overview) return [];
  const items: Attention[] = [];
  if (overview.appeals.pending) {
    items.push({
      key: 'appeals',
      icon: 'i-lucide-message-square',
      warning: true,
      title: t('admin.overview.appeals', overview.appeals.pending),
      detail: overview.appeals.oldestAt
        ? t('admin.overview.appealsOldest', {
            date: formatWardenDate(overview.appeals.oldestAt, locale.value),
          })
        : '',
      to: '/admin/warden/appeals',
      action: t('admin.overview.reviewAppeals'),
    });
  }
  if (overview.inactiveAccounts) {
    items.push({
      key: 'inactive',
      icon: 'i-lucide-clock',
      warning: false,
      title: t('admin.overview.inactive', overview.inactiveAccounts),
      detail: t('admin.overview.inactiveDetail'),
      to: '/admin/users?status=inactive',
      action: t('admin.overview.seeAccounts'),
    });
  }
  if (overview.siteBans) {
    items.push({
      key: 'bans',
      icon: 'i-lucide-ban',
      warning: false,
      title: t('admin.overview.bans', overview.siteBans),
      detail: t('admin.overview.bansDetail'),
      to: '/admin/users?status=banned',
      action: t('admin.overview.seeAccounts'),
    });
  }
  return items;
});

function describe(entry: AdminAuditView): string {
  const actor = entry.actor?.name ?? t('admin.overview.deletedAdmin');
  const target = entry.target?.name ?? t('admin.overview.deletedAccount');
  switch (entry.action) {
    case 'user.roles': {
      const after = entry.data.after as Partial<AdminRolesBody> | undefined;
      const roles = [
        after?.admin ? t('admin.roles.admin') : null,
        after?.wardenAdmin ? t('admin.roles.wardenAdmin') : null,
        after?.eventsManager ? t('admin.roles.eventsManager') : null,
      ].filter(Boolean);
      return t('admin.overview.log.roles', {
        actor,
        target,
        roles: roles.length ? roles.join(', ') : t('admin.users.noRole'),
      });
    }
    case 'user.ban': {
      const expiresAt = entry.data.expiresAt as string | null | undefined;
      return expiresAt
        ? t('admin.overview.log.ban', {
            actor,
            target,
            date: formatWardenDate(expiresAt, locale.value),
          })
        : t('admin.overview.log.banPermanent', { actor, target });
    }
    case 'user.unban':
      return t('admin.overview.log.unban', { actor, target });
    case 'user.signOut':
      return t('admin.overview.log.signOut', { actor, target });
    case 'user.delete':
      return t('admin.overview.log.delete', { actor });
    case 'flag.update':
      return t(entry.data.enabled ? 'admin.overview.log.flagOn' : 'admin.overview.log.flagOff', {
        actor,
        name: t(`admin.flags.items.${flagMessageKey(entry.data.key as FlagKey)}.label`),
      });
    case 'users.deleteInactive': {
      const deleted = Number(entry.data.count ?? 0);
      return t('admin.overview.log.deleteInactive', { count: deleted }, deleted);
    }
  }
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.overview.loadFailed')"
  />

  <div v-else class="flex max-w-4xl flex-col gap-10">
    <section class="flex flex-col gap-4">
      <h2 class="text-xl font-medium text-highlighted">{{ t('admin.overview.attention') }}</h2>
      <ul v-if="attention.length" class="flex flex-col gap-2">
        <li
          v-for="item in attention"
          :key="item.key"
          class="flex flex-wrap items-center gap-4 rounded-lg bg-elevated px-4 py-3"
        >
          <span
            v-if="item.warning"
            class="grid size-9 shrink-0 place-items-center rounded-md bg-warning/10 text-warning"
          >
            <UIcon :name="item.icon" class="size-5" />
          </span>
          <IconTile v-else :icon="item.icon" />
          <div class="flex min-w-0 flex-1 basis-64 flex-col">
            <span class="font-semibold text-highlighted">{{ item.title }}</span>
            <span v-if="item.detail" class="text-sm text-muted">{{ item.detail }}</span>
          </div>
          <UButton :to="item.to" color="neutral" variant="soft" size="md" :label="item.action" />
        </li>
      </ul>
      <p v-else class="text-muted">{{ t('admin.overview.nothing') }}</p>
    </section>

    <section class="flex flex-col gap-4">
      <h2 class="text-xl font-medium text-highlighted">{{ t('admin.overview.recent') }}</h2>
      <ul v-if="data.recent.length" class="flex flex-col divide-y divide-default">
        <li
          v-for="entry in data.recent"
          :key="entry.id"
          class="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5"
        >
          <time :datetime="entry.at" class="w-56 shrink-0 text-sm text-muted tabular-nums">
            {{ formatWardenDateTime(entry.at, locale) }}
          </time>
          <p class="min-w-0 flex-1 basis-64">{{ describe(entry) }}</p>
        </li>
      </ul>
      <p v-else class="text-muted">{{ t('admin.overview.noChanges') }}</p>
    </section>
  </div>
</template>
