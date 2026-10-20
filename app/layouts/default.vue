<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';

// The public site: header, page, footer.
const { t } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const { user } = useAuth();
const { isEnabled } = useFlags();

// Come back to the current page after signing in.
const signInLink = computed(() =>
  route.name === 'sign-in'
    ? route.fullPath
    : { path: '/sign-in', query: { redirect: route.fullPath } },
);

// Warden (Minecraft) is open to some schools only.
const wardenApp = getLinkApp('warden');
const canUseWarden = computed(
  () =>
    isEnabled('warden') &&
    !!wardenApp &&
    !!user.value &&
    canLinkFromSchool(wardenApp, user.value.tenantId),
);

const navItems = computed<NavigationMenuItem[]>(() => {
  // The mod list is public, so everyone gets it, unless its feature flag is off.
  const minecraft: NavigationMenuItem[] = [
    ...(isEnabled('modList')
      ? [
          {
            label: t('nav.mods'),
            description: t('nav.modsDescription'),
            icon: 'i-lucide-puzzle',
            to: '/minecraft/mod-list',
          },
        ]
      : []),
    ...(canUseWarden.value
      ? [
          {
            label: t('warden.title'),
            description: t('nav.wardenDescription'),
            icon: 'i-lucide-pickaxe',
            to: '/minecraft/warden',
          },
        ]
      : []),
  ];
  const about: NavigationMenuItem[] = [
    ...(isEnabled('team')
      ? [
          {
            label: t('nav.team'),
            description: t('nav.teamDescription'),
            icon: 'i-lucide-users-round',
            to: '/team',
          },
        ]
      : []),
    ...(isEnabled('partners')
      ? [
          {
            label: t('nav.partners'),
            description: t('nav.partnersDescription'),
            icon: 'i-lucide-handshake',
            to: '/partners',
          },
        ]
      : []),
  ];
  return [
    { label: t('nav.home'), icon: 'i-lucide-house', to: localePath('index'), exact: true },
    ...(isEnabled('events')
      ? [{ label: t('nav.events'), icon: 'i-lucide-calendar', to: '/events' }]
      : []),
    // No menu when every page in it is off.
    ...(minecraft.length
      ? [
          {
            label: t('nav.minecraft'),
            icon: 'i-lucide-blocks',
            active: route.path.startsWith('/minecraft/'),
            children: minecraft,
          },
        ]
      : []),
    ...(about.length
      ? [
          {
            label: t('nav.about'),
            icon: 'i-lucide-info',
            active: route.path === '/team' || route.path === '/partners',
            children: about,
          },
        ]
      : []),
  ];
});
</script>

<template>
  <div>
    <UHeader :title="t('site.name')" :to="localePath('index')">
      <template #title>
        <img src="/logo.svg" alt="" class="size-8 dark:hidden" />
        <img src="/logo-dark.svg" alt="" class="hidden size-8 dark:block" />
        <span>{{ t('site.name') }}</span>
      </template>

      <!-- Categories open a single column of links, each with its description below. The current
           page's line sits on the header's bottom border. -->
      <UNavigationMenu
        :items="navItems"
        content-orientation="vertical"
        highlight
        :ui="{ link: 'after:-bottom-4 after:h-0.5' }"
      />

      <template #right>
        <AccountMenu v-if="user" :user="user" />
        <UButton
          v-else
          color="neutral"
          variant="outline"
          size="lg"
          icon="i-lucide-user"
          :label="t('auth.signIn')"
          :to="signInLink"
        />
      </template>

      <template #body>
        <UNavigationMenu :items="navItems" orientation="vertical" class="-mx-2.5" />
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>

    <SiteFooter />
  </div>
</template>
