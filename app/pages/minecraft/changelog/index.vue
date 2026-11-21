<script setup lang="ts">
import type { ChangelogPublicList } from '#shared/schemas/changelog';

// What changed on the Minecraft server: the newest post as a band, the older ones as dated rows.
// Public. See docs/changelog.md.
definePageMeta({ auth: false, flag: 'changelog' });

const { t, locale } = useI18n();
useSeoMeta({ title: () => t('changelog.title'), description: () => t('changelog.lede') });
useHead({
  link: [{ rel: 'alternate', type: 'application/atom+xml', href: '/minecraft/changelog.atom' }],
});

const { data, error } = await usePublicChangelog();

// The first page comes from the fetch above; "Load more" appends the following ones.
const more = ref<ChangelogPublicList['posts']>([]);
const next = ref<string | null>(null);
const loadFailed = ref(false);
const loading = ref(false);
watch(
  data,
  (page) => {
    more.value = [];
    next.value = page?.next ?? null;
  },
  { immediate: true },
);

const posts = computed(() => [...(data.value?.posts ?? []), ...more.value]);
const latest = computed(() => posts.value[0]);
const older = computed(() => posts.value.slice(1));

async function loadMore() {
  if (!next.value) return;
  loading.value = true;
  loadFailed.value = false;
  try {
    const page = await $fetch<ChangelogPublicList>('/api/changelog/posts', {
      query: { lang: locale.value, limit: 10, before: next.value },
    });
    more.value.push(...page.posts);
    next.value = page.next;
  } catch {
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <UContainer class="flex flex-col gap-10 py-12">
    <div class="flex flex-col gap-3">
      <h1 class="text-4xl font-bold text-highlighted">{{ t('changelog.title') }}</h1>
      <p class="max-w-prose text-muted">{{ t('changelog.lede') }}</p>
    </div>

    <p v-if="error" class="rounded-lg bg-elevated p-6 text-muted">
      {{ t('changelog.loadError') }}
    </p>
    <div
      v-else-if="!latest"
      class="flex flex-col items-center gap-3 rounded-lg bg-elevated p-10 text-center"
    >
      <IconTile icon="i-lucide-scroll-text" />
      <h2 class="text-lg font-bold text-highlighted">{{ t('changelog.empty.title') }}</h2>
      <p class="max-w-prose text-muted">{{ t('changelog.empty.body') }}</p>
    </div>
    <template v-else>
      <ChangelogFeatured :post="latest" />
      <ul v-if="older.length" class="flex flex-col gap-2">
        <li v-for="post in older" :key="post.slug">
          <ChangelogRow :post="post" />
        </li>
      </ul>
      <div v-if="next" class="flex flex-col items-start gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :loading="loading"
          :label="t('changelog.loadMore')"
          @click="loadMore"
        />
        <p v-if="loadFailed" class="text-sm text-error" role="alert">
          {{ t('changelog.loadError') }}
        </p>
      </div>
    </template>
  </UContainer>
</template>
