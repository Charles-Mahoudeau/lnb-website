<script setup lang="ts">
import type { ShortLinkPublic } from '#shared/schemas/short-links';

// Where /r/<id> sends a visitor who can't follow the link yet: signed out, from another school,
// or the link is off. The destination never shows here.
definePageMeta({ auth: false });

const { t, locale } = useI18n();
const route = useRoute();
const { school } = useAuth();

const id = computed(() => String(route.query.id ?? ''));
const requested = computed(() => String(route.query.state ?? 'off'));
const { data } = await useFetch<ShortLinkPublic>(
  () => `/api/short-links/${encodeURIComponent(id.value)}`,
  { key: 'short-link-public' },
);

// The URL says what happened to this visit, the API says what the link asks for.
const state = computed(() =>
  !data.value || data.value.state === 'off'
    ? 'off'
    : ['signIn', 'wrongSchool'].includes(requested.value)
      ? requested.value
      : 'off',
);
const schools = computed(() =>
  new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(
    data.value?.schools.length ? data.value.schools : [],
  ),
);
const ICONS: Record<string, string> = {
  signIn: 'i-lucide-lock',
  wrongSchool: 'i-lucide-school',
  off: 'i-lucide-link',
};
const icon = computed(() => ICONS[state.value] ?? 'i-lucide-link');

useSeoMeta({ title: () => t(`shortLink.${state.value}.title`), robots: 'noindex' });
</script>

<template>
  <UContainer class="flex flex-col items-center py-16">
    <section class="flex max-w-md flex-col items-center gap-4 text-center">
      <IconTile :icon="icon" />
      <h1 class="text-2xl font-bold text-highlighted">{{ t(`shortLink.${state}.title`) }}</h1>
      <p class="text-muted">
        <template v-if="state === 'signIn'">
          {{
            data?.access === 'schools'
              ? t('shortLink.signIn.schools', { schools })
              : t('shortLink.signIn.any')
          }}
          <template v-if="data?.recordClicks">{{ t('shortLink.signIn.recorded') }}</template>
        </template>
        <template v-else-if="state === 'wrongSchool'">
          {{ t('shortLink.wrongSchool.body', { schools }) }}
          <template v-if="school">{{ t('shortLink.wrongSchool.yours', { school }) }}</template>
        </template>
        <template v-else>{{ t('shortLink.off.body') }}</template>
      </p>
      <UButton
        v-if="state === 'signIn'"
        :to="{ path: '/sign-in', query: { redirect: `/r/${id}` } }"
        size="lg"
        :label="t('shortLink.signIn.button')"
      />
      <UButton
        v-else
        to="/"
        color="neutral"
        variant="outline"
        size="lg"
        :label="t('shortLink.home')"
      />
    </section>
  </UContainer>
</template>
