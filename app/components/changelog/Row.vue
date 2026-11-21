<script setup lang="ts">
import type { ChangelogPublicPost } from '#shared/schemas/changelog';

// An older post as a dated row, like the events agenda: day and month, the title, the summary
// and the version as a badge.
defineProps<{ post: ChangelogPublicPost }>();

const { locale } = useI18n();
</script>

<template>
  <NuxtLink
    :to="`/minecraft/changelog/${post.slug}`"
    class="flex items-center gap-4 rounded-lg bg-elevated p-3 hover:bg-accented/50 sm:pe-4"
  >
    <time
      :datetime="post.publishedAt"
      class="flex w-14 shrink-0 flex-col items-center border-r border-default py-1 tabular-nums"
    >
      <span class="font-display text-2xl leading-none font-bold text-secondary">
        {{ formatEventDate(post.publishedAt, locale, { day: 'numeric' }) }}
      </span>
      <span class="mt-1 text-sm text-muted">
        {{ formatEventDate(post.publishedAt, locale, { month: 'short' }) }}
      </span>
      <span class="text-xs text-muted">
        {{ formatEventDate(post.publishedAt, locale, { year: 'numeric' }) }}
      </span>
    </time>
    <div class="min-w-0 flex-1">
      <h3 class="font-bold text-highlighted">{{ post.title }}</h3>
      <p v-if="post.summary" class="line-clamp-2 text-sm text-muted">{{ post.summary }}</p>
    </div>
    <UBadge
      v-if="post.versionTag"
      color="neutral"
      variant="outline"
      class="shrink-0"
      :label="post.versionTag"
    />
  </NuxtLink>
</template>
