<script setup lang="ts">
import type { ChangelogPublicPost } from '#shared/schemas/changelog';

// The newest post as a raised band: version, date, title, the whole summary and one button. A
// cover image shows beside the text only when the post has one.
defineProps<{ post: ChangelogPublicPost }>();

const { t, locale } = useI18n();
</script>

<template>
  <article class="grid overflow-hidden rounded-lg bg-elevated md:grid-cols-12">
    <img
      v-if="post.coverUrl"
      :src="post.coverUrl"
      alt=""
      class="aspect-video size-full object-cover md:col-span-5 md:aspect-auto"
    />
    <div
      class="flex min-w-0 flex-col items-start gap-3 p-5 sm:p-7"
      :class="post.coverUrl ? 'md:col-span-7' : 'md:col-span-12'"
    >
      <div class="flex flex-wrap items-center gap-2">
        <UBadge v-if="post.versionTag" color="secondary" variant="soft" :label="post.versionTag" />
        <time :datetime="post.publishedAt" class="text-sm text-muted tabular-nums">
          {{ formatEventDate(post.publishedAt, locale, { dateStyle: 'long' }) }}
        </time>
      </div>
      <h2 class="font-display text-3xl font-bold text-highlighted">{{ post.title }}</h2>
      <p v-if="post.summary" class="max-w-prose text-muted">{{ post.summary }}</p>
      <UButton
        :to="`/minecraft/changelog/${post.slug}`"
        size="lg"
        class="mt-2"
        :label="t('changelog.read')"
      />
    </div>
  </article>
</template>
