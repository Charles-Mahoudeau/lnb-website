<script setup lang="ts">
// The public site's footer: who we are, the pages that are on, the project, then the legal line.
// A column drops out when every link in it is off.
const { t } = useI18n();
const localePath = useLocalePath();
const { user } = useAuth();
const { isEnabled } = useFlags();

const wardenApp = getLinkApp('warden');
const canUseWarden = computed(
  () =>
    isEnabled('warden') &&
    !!wardenApp &&
    !!user.value &&
    canLinkFromSchool(wardenApp, user.value.tenantId),
);

interface FooterLink {
  label: string;
  to: string;
  external?: boolean;
}

// The Gamesplanet row above the columns, and the affiliate notice in the legal line, which stays
// while the promotion is on even when the row is off (docs/design.md).
const showGamesplanet = computed(() => isEnabled('gamesplanet'));
const showGamesplanetRow = computed(() => showGamesplanet.value && isEnabled('gamesplanet.footer'));

const columns = computed(() => {
  const site: FooterLink[] = [
    { label: t('nav.home'), to: localePath('index') },
    ...(isEnabled('events')
      ? [
          { label: t('nav.events'), to: '/events' },
          { label: t('home.pastEvents'), to: '/events?tab=past' },
        ]
      : []),
    ...(isEnabled('team') ? [{ label: t('nav.team'), to: '/team' }] : []),
    ...(isEnabled('partners') ? [{ label: t('nav.partners'), to: '/partners' }] : []),
  ];
  const minecraft: FooterLink[] = [
    ...(isEnabled('modList') ? [{ label: t('nav.mods'), to: '/minecraft/mod-list' }] : []),
    ...(canUseWarden.value ? [{ label: t('warden.title'), to: '/minecraft/warden' }] : []),
    ...(canUseWarden.value && isEnabled('economy')
      ? [{ label: t('economy.bank.title'), to: '/minecraft/bank' }]
      : []),
    ...(user.value && isEnabled('economy.baltop')
      ? [{ label: t('economy.baltop.title'), to: '/minecraft/baltop' }]
      : []),
  ];
  const project: FooterLink[] = [
    { label: t('footer.studentOffice'), to: 'https://bde-teknantes.fr/', external: true },
    {
      label: t('footer.sourceCode'),
      to: 'https://github.com/Charles-Mahoudeau/lnb-website',
      external: true,
    },
    { label: t('footer.apiReference'), to: '/api/docs', external: true },
  ];
  return [
    { key: 'site', title: t('footer.site'), links: site },
    { key: 'minecraft', title: t('nav.minecraft'), links: minecraft },
    { key: 'project', title: t('footer.project'), links: project },
  ].filter((column) => column.links.length);
});
</script>

<template>
  <footer class="bg-elevated">
    <UContainer class="flex flex-col gap-10 py-10">
      <div v-if="showGamesplanetRow" class="flex flex-wrap items-center gap-4">
        <IconTile icon="i-lucide-heart" />
        <p class="min-w-56 flex-1 text-default">{{ t('gamesplanet.footer.line') }}</p>
        <UButton
          :to="gamesplanetGoUrl('site', 'footer')"
          target="_blank"
          external
          rel="sponsored noopener noreferrer"
          color="neutral"
          variant="outline"
          trailing-icon="i-lucide-external-link"
          :label="t('gamesplanet.footer.button')"
        />
      </div>

      <div class="grid gap-10 md:grid-cols-5">
        <div class="flex max-w-xs flex-col items-start gap-4 md:col-span-2">
          <NuxtLink :to="localePath('index')" class="flex items-center gap-2.5">
            <img src="/logo.svg" alt="" class="size-8 dark:hidden" />
            <img src="/logo-dark.svg" alt="" class="hidden size-8 dark:block" />
            <span class="font-display font-medium text-highlighted">{{ t('site.name') }}</span>
          </NuxtLink>
          <p class="text-muted">{{ t('footer.about') }}</p>
          <ul class="flex flex-wrap gap-2">
            <li v-for="school in SCHOOLS" :key="school">
              <UBadge color="neutral" variant="soft" :label="school" />
            </li>
          </ul>
        </div>

        <nav
          v-for="column in columns"
          :key="column.key"
          :aria-label="column.title"
          class="flex flex-col gap-3"
        >
          <h2 class="text-base font-bold text-highlighted">{{ column.title }}</h2>
          <ul class="flex flex-col gap-2">
            <li v-for="link in column.links" :key="link.to">
              <ULink
                :to="link.to"
                :external="link.external"
                :target="link.external ? '_blank' : undefined"
                class="text-muted hover:text-default hover:underline"
              >
                {{ link.label }}
              </ULink>
            </li>
          </ul>
        </nav>
      </div>

      <div class="flex flex-col gap-1 text-sm text-muted">
        <p>{{ t('footer.legal', { year: new Date().getFullYear(), name: t('site.name') }) }}</p>
        <p v-if="showGamesplanet">{{ t('gamesplanet.footer.notice') }}</p>
      </div>
    </UContainer>
  </footer>
</template>
