<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';

import type { AdminEntry } from '~/utils/admin-nav';

// The admin area (/admin): a sidebar instead of the public header. The entries, the groups and
// who sees what are data in utils/admin-nav.ts, from docs/plans/admin-redesign.md. Each page
// renders an AdminPage or an AdminTabPage.
const { t } = useI18n();
const { user, school } = useAuth();
const route = useRoute();
const fold = useAdminFold();

// The anticheat's waiting work, for the badge on its entry. Warden admins only. The counts of
// every entry come from one inbox endpoint later.
const summary = isWardenAdmin(user.value?.role) ? useAnticheatSummary() : null;
const anticheatBadge = computed(() => {
  const count = (summary?.data.value?.alerts ?? 0) + (summary?.data.value?.waiting ?? 0);
  return count > 0 ? count : undefined;
});

const entries = computed(() => adminEntries(user.value?.role));

function toItem(entry: AdminEntry): NavigationMenuItem {
  return {
    label: t(entry.labelKey),
    icon: entry.icon,
    to: entry.to,
    active: entryIsActive(entry, route.path),
    badge: entry.id === 'anticheat' ? anticheatBadge.value : undefined,
  };
}

const top = computed<NavigationMenuItem[]>(() =>
  entries.value.filter((entry) => !entry.group).map(toItem),
);

const groups = computed(() =>
  (
    [
      { id: 'events', icon: 'i-lucide-calendar-days', label: t('admin.nav.eventsGroup') },
      { id: 'minecraft', icon: 'i-lucide-pickaxe', label: t('admin.nav.minecraftGroup') },
    ] as const
  )
    .map((group) => ({
      ...group,
      items: entries.value.filter((entry) => entry.group === group.id).map(toItem),
    }))
    .filter((group) => group.items.length > 0),
);

const settings = computed<NavigationMenuItem[]>(() =>
  settingsSections(user.value?.role).length
    ? [
        {
          label: t('admin.nav.settings'),
          icon: 'i-lucide-settings',
          to: '/admin/settings',
          active: route.path.startsWith('/admin/settings'),
        },
      ]
    : [],
);
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar :ui="{ footer: 'flex-col items-stretch gap-1' }">
      <template #header>
        <NuxtLink
          to="/admin"
          class="flex items-center gap-2.5 font-display font-bold text-highlighted"
        >
          <img src="/logo.svg" alt="" class="size-7 dark:hidden" />
          <img src="/logo-dark.svg" alt="" class="hidden size-7 dark:block" />
          <span>{{ t('admin.title') }}</span>
        </NuxtLink>
      </template>

      <div class="flex flex-col gap-3">
        <UNavigationMenu :items="top" orientation="vertical" />
        <UCollapsible
          v-for="group in groups"
          :key="group.id"
          :open="fold.open.value[group.id]"
          @update:open="(value: boolean) => fold.set(group.id, value)"
        >
          <UButton
            color="neutral"
            variant="ghost"
            block
            size="sm"
            class="justify-start text-muted"
            :icon="group.icon"
            :trailing-icon="
              fold.open.value[group.id] ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'
            "
            :label="group.label"
            :ui="{ trailingIcon: 'ms-auto' }"
          />
          <template #content>
            <UNavigationMenu :items="group.items" orientation="vertical" class="mt-1" />
          </template>
        </UCollapsible>
      </div>

      <template #footer>
        <UNavigationMenu v-if="settings.length" :items="settings" orientation="vertical" />
        <UButton
          to="/"
          color="neutral"
          variant="ghost"
          size="md"
          icon="i-lucide-arrow-left"
          :label="t('admin.backToSite')"
        />
        <UUser v-if="user" :name="user.name" :description="school" class="px-2.5 py-1.5">
          <template #avatar>
            <UserAvatar :user-id="user.id" :name="user.name" :image="user.image" />
          </template>
        </UUser>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
