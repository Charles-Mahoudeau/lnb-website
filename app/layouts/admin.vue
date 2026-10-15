<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';

// The admin area (/admin): a sidebar instead of the public header. Each page renders an
// AdminPage. Warden admins only see the Warden and Mods sections.
const { t } = useI18n();
const { user, school } = useAuth();

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
        ],
      ]
    : []),
  [
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

      <!-- Selection is state, not an action, so the current page is marked in neutral. -->
      <UNavigationMenu :items="items" orientation="vertical" color="neutral" />

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
          :avatar="{ alt: user.name }"
          class="px-2.5 py-1.5"
        />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
