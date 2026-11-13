<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';

// The admin area (/admin): a sidebar instead of the public header. Each page renders an
// AdminPage. Warden admins only see the Warden and Mods sections, events managers only Events,
// Push and Short links, economy admins only Economy.
const { t } = useI18n();
const { user, school } = useAuth();
const route = useRoute();

// The anticheat's waiting work, for the badge on its group. Warden admins only.
const summary = isWardenAdmin(user.value?.role) ? useAnticheatSummary() : null;
const anticheatBadge = computed(() => {
  const count = (summary?.data.value?.alerts ?? 0) + (summary?.data.value?.waiting ?? 0);
  return count > 0 ? count : undefined;
});

const wardenItems = computed<NavigationMenuItem[]>(() => [
  {
    label: t('admin.nav.warden'),
    icon: 'i-lucide-pickaxe',
    defaultOpen: true,
    children: [
      { label: t('admin.nav.players'), to: '/admin/warden/players' },
      { label: t('admin.nav.appeals'), to: '/admin/warden/appeals' },
      { label: t('admin.nav.activity'), to: '/admin/warden/activity' },
      { label: t('admin.nav.settings'), to: '/admin/warden/settings' },
    ],
  },
  {
    label: t('admin.nav.anticheat'),
    icon: 'i-lucide-shield-check',
    defaultOpen: true,
    badge: anticheatBadge.value,
    children: [
      { label: t('admin.nav.anticheatFiles'), to: '/admin/anticheat', exact: true },
      { label: t('admin.nav.anticheatReview'), to: '/admin/anticheat/review' },
      { label: t('admin.nav.anticheatPlayers'), to: '/admin/anticheat/players' },
      { label: t('admin.nav.anticheatSettings'), to: '/admin/anticheat/settings' },
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
          {
            label: t('admin.nav.rateLimit'),
            icon: 'i-lucide-gauge',
            to: '/admin/rate-limit',
          },
          { label: t('admin.nav.apiKeys'), icon: 'i-lucide-key-round', to: '/admin/api-keys' },
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
              { label: t('admin.nav.posters'), to: '/admin/posters' },
            ],
          },
        ]
      : []),
    ...(isEventsManager(user.value?.role)
      ? [
          { label: t('admin.nav.push'), icon: 'i-lucide-bell', to: '/admin/push' },
          {
            label: t('admin.nav.partnerEvents'),
            icon: 'i-lucide-trophy',
            to: '/admin/partner-events',
          },
          { label: t('admin.nav.shortLinks'), icon: 'i-lucide-link', to: '/admin/short-links' },
        ]
      : []),
    ...(isWardenAdmin(user.value?.role) ? wardenItems.value : []),
    ...(isEconomyAdmin(user.value?.role)
      ? [
          {
            label: t('admin.nav.economy'),
            icon: 'i-lucide-landmark',
            defaultOpen: true,
            children: [
              { label: t('admin.nav.economyOverview'), to: '/admin/economy', exact: true },
              { label: t('admin.nav.economyAccounts'), to: '/admin/economy/accounts' },
              { label: t('admin.nav.economyLedger'), to: '/admin/economy/ledger' },
              { label: t('admin.nav.settings'), to: '/admin/economy/settings' },
            ],
          },
        ]
      : []),
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
