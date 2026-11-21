<script setup lang="ts">
import type { ChangelogList } from '#shared/schemas/changelog';

// The changelog posts as rows: title, version tag and date, then the language state and status.
const { t, d } = useI18n();
const { data, error } = await useAdminChangelog();

type Post = ChangelogList['posts'][number];

const when = (post: Post) =>
  d(post.publishedAt ?? post.createdAt, { dateStyle: 'medium', timeZone: 'Europe/Paris' });

const STATUS_COLORS = { draft: 'neutral', scheduled: 'neutral', published: 'success' } as const;
const STATUS_ICONS = {
  draft: 'i-lucide-file-pen-line',
  scheduled: 'i-lucide-clock',
  published: 'i-lucide-check',
} as const;

function languageState(post: Post) {
  if (!post.hasTranslation) return 'none';
  return post.translationUnreviewed ? 'unreviewed' : 'translated';
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.changelog.errors.failed')"
  />
  <section v-else class="flex flex-col rounded-lg bg-elevated p-5">
    <div v-if="!data.posts.length" class="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <IconTile icon="i-lucide-megaphone" />
      <h2 class="text-lg font-bold text-highlighted">{{ t('admin.changelog.empty.title') }}</h2>
      <p class="max-w-prose text-muted">{{ t('admin.changelog.empty.body') }}</p>
      <UButton
        to="/admin/minecraft/changelog/new"
        color="neutral"
        variant="soft"
        icon="i-lucide-plus"
        size="md"
        :label="t('admin.changelog.add')"
      />
    </div>
    <ul v-else class="flex flex-col divide-y divide-default">
      <li v-for="post in data.posts" :key="post.id">
        <NuxtLink
          :to="`/admin/minecraft/changelog/${post.id}`"
          class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 hover:bg-accented/40"
        >
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="truncate font-semibold text-highlighted">{{ post.title }}</span>
            <span class="flex flex-wrap items-center gap-2 text-sm text-muted">
              <UBadge
                v-if="post.versionTag"
                color="neutral"
                variant="outline"
                size="sm"
                :label="post.versionTag"
              />
              <span class="tabular-nums">
                {{ post.status === 'scheduled' ? t('admin.changelog.goesOut') : '' }}
                {{ when(post) }}
              </span>
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              color="neutral"
              variant="subtle"
              size="sm"
              :label="t(`admin.changelog.languages.${post.sourceLang}`)"
            />
            <UBadge
              v-if="languageState(post) === 'unreviewed'"
              color="warning"
              variant="subtle"
              size="sm"
              :label="t('admin.changelog.notReviewed')"
            />
            <UBadge
              v-else-if="languageState(post) === 'translated'"
              color="neutral"
              variant="subtle"
              size="sm"
              :label="t('admin.changelog.translated')"
            />
            <UBadge
              :color="STATUS_COLORS[post.status]"
              :variant="post.status === 'draft' ? 'outline' : 'subtle'"
              :icon="STATUS_ICONS[post.status]"
              size="md"
              :label="t(`admin.changelog.status.${post.status}`)"
            />
          </div>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
