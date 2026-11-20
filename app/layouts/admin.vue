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

// What is waiting, for the badges: the same fetch as the Home rows (one key), refreshed on each
// navigation inside the admin. A count is work to do, so the badges are neutral, never red.
const { data: inbox, refresh } = useAdminInbox();
watch(
  () => route.path,
  () => void refresh(),
);
const counts = computed(() => inbox.value?.badges ?? {});

const entries = computed(() => adminEntries(user.value?.role));

function toItem(entry: AdminEntry): NavigationMenuItem {
  return {
    label: t(entry.labelKey),
    icon: entry.icon,
    to: entry.to,
    active: entryIsActive(entry, route.path),
    badge: counts.value[entry.id]
      ? { label: String(counts.value[entry.id]), color: 'neutral', variant: 'subtle' }
      : undefined,
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
      // A folded group shows the total of its entries.
      total: entries.value
        .filter((entry) => entry.group === group.id)
        .reduce((sum, entry) => sum + (counts.value[entry.id] ?? 0), 0),
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
        <!-- Below the header: the header has a fixed height and only fits one row. -->
        <UDashboardSearchButton :label="t('admin.search.button')" class="w-full" />
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
            :label="group.label"
          >
            <template #trailing>
              <span class="ms-auto flex items-center gap-2">
                <UBadge
                  v-if="!fold.open.value[group.id] && group.total"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  :label="String(group.total)"
                />
                <UIcon
                  :name="
                    fold.open.value[group.id] ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'
                  "
                  class="size-5 shrink-0"
                />
              </span>
            </template>
          </UButton>
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

    <AdminSearch />

    <slot />
  </UDashboardGroup>
</template>
