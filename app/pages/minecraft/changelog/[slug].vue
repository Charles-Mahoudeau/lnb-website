<script setup lang="ts">
import type { ChangelogPublicDetail } from '#shared/schemas/changelog';

// One post at reading width, with a side column (language, recent posts, the in-game command)
// and Older and Newer under the text. Public. See docs/changelog.md.
definePageMeta({ auth: false, flag: 'changelog' });

const { t, locale } = useI18n();
const slug = String(useRoute().params.slug);

// A view switch between the languages the post has. Not stored: the app's language wins again on
// the next visit.
const viewLang = ref<'en' | 'fr'>(locale.value === 'fr' ? 'fr' : 'en');
const { data: post } = await useFetch<ChangelogPublicDetail>(`/api/changelog/posts/${slug}`, {
  query: computed(() => ({ lang: viewLang.value })),
  key: `changelog-post-${slug}`,
});
if (!post.value) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found', fatal: true });
}
const { data: recent } = await usePublicChangelog(6);

useSeoMeta({
  title: () => post.value?.title ?? t('changelog.title'),
  description: () => post.value?.summary ?? t('changelog.lede'),
});

const languages = computed(() => post.value?.languages ?? []);
const langItems = computed(() =>
  languages.value.map((value) => ({ label: t(`changelog.languages.${value}`), value })),
);
const others = computed(() =>
  (recent.value?.posts ?? []).filter((p) => p.slug !== slug).slice(0, 5),
);
</script>

<template>
  <UContainer v-if="post" class="py-12">
    <div class="grid gap-10 lg:grid-cols-12">
      <div class="flex min-w-0 flex-col gap-8 lg:col-span-8">
        <article class="flex max-w-prose flex-col gap-6">
          <header class="flex flex-col gap-3">
            <NuxtLink to="/minecraft/changelog" class="text-sm text-primary hover:underline">
              {{ t('changelog.title') }}
            </NuxtLink>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                v-if="post.versionTag"
                color="secondary"
                variant="soft"
                :label="post.versionTag"
              />
              <time :datetime="post.publishedAt" class="text-sm text-muted tabular-nums">
                {{ formatEventDate(post.publishedAt, locale, { dateStyle: 'long' }) }}
              </time>
            </div>
            <h1 class="font-display text-3xl font-bold text-highlighted sm:text-4xl">
              {{ post.title }}
            </h1>
          </header>
          <!-- eslint-disable-next-line vue/no-v-html -- sanitized by markdown-it on the server -->
          <div class="changelog-prose" v-html="post.html" />
        </article>

        <nav
          v-if="post.older || post.newer"
          :aria-label="t('changelog.navigation')"
          class="flex flex-wrap justify-between gap-3"
        >
          <UButton
            v-if="post.older"
            :to="`/minecraft/changelog/${post.older.slug}`"
            color="neutral"
            variant="outline"
            size="lg"
            class="max-w-full"
          >
            <span class="flex min-w-0 flex-col items-start text-left">
              <span class="text-xs text-muted">{{ t('changelog.older') }}</span>
              <span class="max-w-full truncate">{{ post.older.title }}</span>
            </span>
          </UButton>
          <UButton
            v-if="post.newer"
            :to="`/minecraft/changelog/${post.newer.slug}`"
            color="neutral"
            variant="outline"
            size="lg"
            class="ms-auto max-w-full"
          >
            <span class="flex min-w-0 flex-col items-end text-right">
              <span class="text-xs text-muted">{{ t('changelog.newer') }}</span>
              <span class="max-w-full truncate">{{ post.newer.title }}</span>
            </span>
          </UButton>
        </nav>
      </div>

      <aside class="flex flex-col gap-4 lg:col-span-4">
        <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
          <h2 class="font-bold text-highlighted">{{ t('changelog.language') }}</h2>
          <UTabs
            v-if="languages.length > 1"
            v-model="viewLang"
            :items="langItems"
            variant="pill"
            :content="false"
            size="sm"
          />
          <p v-else class="text-sm text-muted">
            {{ t('changelog.notTranslated', { language: t(`changelog.languages.${post.lang}`) }) }}
          </p>
        </section>
        <section v-if="others.length" class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
          <h2 class="font-bold text-highlighted">{{ t('changelog.recent') }}</h2>
          <ul class="flex flex-col gap-2">
            <li v-for="item in others" :key="item.slug">
              <NuxtLink
                :to="`/minecraft/changelog/${item.slug}`"
                class="flex items-baseline justify-between gap-3 hover:underline"
              >
                <span class="min-w-0 truncate text-default">{{ item.title }}</span>
                <span class="shrink-0 text-sm text-muted tabular-nums">
                  {{
                    formatEventDate(item.publishedAt, locale, { day: 'numeric', month: 'short' })
                  }}
                </span>
              </NuxtLink>
            </li>
          </ul>
        </section>
        <section class="flex flex-col gap-2 rounded-lg bg-elevated p-5">
          <h2 class="font-bold text-highlighted">{{ t('changelog.inGame') }}</h2>
          <i18n-t keypath="changelog.inGameHint" tag="p" class="text-sm text-muted">
            <template #command>
              <UBadge color="neutral" variant="soft" label="/changelog" />
            </template>
          </i18n-t>
        </section>
      </aside>
    </div>
  </UContainer>
</template>
