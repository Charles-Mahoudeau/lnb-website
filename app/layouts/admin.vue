<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';

// The admin area (/admin): a sidebar instead of the public header. Each page renders an
// AdminPage. Warden admins only see the Warden and Mods sections, events managers only Events.
const { t } = useI18n();
const { user, school } = useAuth();
const route = useRoute();

const wardenItems = computed<NavigationMenuItem[]>(() => [
  {
    label: t('admin.nav.warden'),
    icon: 'i-lucide-pickaxe',
    defaultOpen: true,
    children: [
      { label: t('admin.nav.players'), to: '/admin/warden/players' },
      { label: t('admin.nav.appeals'), to: '/admin/warden/appeals' },
      { label: t('admin.nav.linking'), to: '/admin/warden/linking' },
      { label: t('admin.nav.activity'), to: '/admin/warden/activity' },
      { label: t('admin.nav.settings'), to: '/admin/warden/settings' },
    ],
  },
  {
    label: t('admin.nav.mods'),
    icon: 'i-lucide-blocks',
    defaultOpen: true,
    children: [
      { label: t('admin.nav.modList'), to: '/admin/mods', exact: true },
      { label: t('admin.nav.modSuggestions'), to: '/admin/mods/suggestions' },
    ],
  },
]);

const items = computed<NavigationMenuItem[][]>(() => [
  ...(isAdmin(user.value?.role)
    ? [
        [
          {
            label: t('admin.nav.overview'),
            icon: 'i-lucide-layout-dashboard',
            to: '/admin',
            exact: true,
          },
          { label: t('admin.nav.users'), icon: 'i-lucide-users', to: '/admin/users' },
          { label: t('admin.nav.team'), icon: 'i-lucide-users-round', to: '/admin/team' },
          { label: t('admin.nav.partners'), icon: 'i-lucide-handshake', to: '/admin/partners' },
          { label: t('admin.nav.flags'), icon: 'i-lucide-toggle-right', to: '/admin/flags' },
        ],
      ]
    : []),
  [
    ...(isEventsManager(user.value?.role)
      ? [
          {
            label: t('admin.nav.events'),
            icon: 'i-lucide-calendar',
            defaultOpen: true,
            children: [
              {
                label: t('admin.nav.eventList'),
                to: '/admin/events',
                // The list, and each event's page under it, but not rooms or types.
                active:
                  route.path === '/admin/events' ||
                  /^\/admin\/events\/(?!rooms|types)/.test(route.path),
              },
              { label: t('admin.nav.eventRooms'), to: '/admin/events/rooms' },
              { label: t('admin.nav.eventTypes'), to: '/admin/events/types' },
            ],
          },
        ]
      : []),
    ...(isEventsManager(user.value?.role)
      ? [{ label: t('admin.nav.push'), icon: 'i-lucide-bell', to: '/admin/push' }]
      : []),
    ...(isWardenAdmin(user.value?.role) ? wardenItems.value : []),
  ],
]);
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

      <UNavigationMenu :items="items" orientation="vertical" />

      <template #footer>
        <UButton
          to="/"
          color="neutral"
          variant="ghost"
          size="md"
          icon="i-lucide-arrow-left"
          :label="t('admin.backToSite')"
        />
        <UUser
          v-if="user"
          :name="user.name"
          :description="school"
          :avatar="{ src: user.image ?? undefined, alt: user.name, ui: avatarTint(user.id) }"
          class="px-2.5 py-1.5"
        />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
