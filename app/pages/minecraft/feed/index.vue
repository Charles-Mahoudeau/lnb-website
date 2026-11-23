<script setup lang="ts">
import { WardenConfirmModal } from '#components';

import type { FeedMe, FeedName, FeedPostView } from '#shared/schemas/feed';

// The Feed (docs/feed.md, "The Feed page", mock A "one column"): the Announcements and Global
// tabs, the composer or the band that replaces it, then the feed with its pinned group and "Load
// more". Signed in only. Without live updates, a reload shows newer posts.
definePageMeta({ flag: 'feed' });

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const overlay = useOverlay();
const toasts = useFeedToasts();
useFeedClock();
const confirm = overlay.create(WardenConfirmModal);

useSeoMeta({ title: () => t('feed.title'), description: () => t('feed.lede'), robots: 'noindex' });

const feed = computed<FeedName>({
  get: () => feedFromQuery(route.query.feed),
  set: (value) =>
    void router.replace({
      query: { ...route.query, feed: value === 'global' ? 'global' : undefined },
    }),
});

const { data: me, error: meError } = await useFeedMe();
const timeline = await useFeedTimeline(feed);

const canAct = computed(() => canWriteFeed(me.value));
const canPost = computed(
  () => canAct.value && (feed.value === 'global' || me.value?.rights.announce === true),
);
const composer = useTemplateRef<{ $el: HTMLElement }>('composer');

const tabs = computed(() =>
  FEED_TABS.map((value) => ({
    value,
    label: t(`feed.tabs.${value}`),
    icon: value === 'announcements' ? 'i-lucide-megaphone' : 'i-lucide-messages-square',
  })),
);

// The dots: unread from the server, cleared for a feed once its first page is shown.
const unread = computed(() => me.value?.unread ?? { announcements: false, global: false });
watch(
  [feed, timeline.page],
  ([name, page]) => {
    if (!import.meta.client || !page || page.feed !== name) return;
    const upTo = newestFeedCreatedAt(page);
    if (me.value) me.value = { ...me.value, unread: { ...me.value.unread, [name]: false } };
    if (upTo) feedActions.markFeedSeen(name, upTo).catch(() => {});
  },
  { immediate: true },
);

const empty = computed(
  () =>
    timeline.status.value === 'success' &&
    !timeline.pinned.value.length &&
    !timeline.posts.value.length,
);
const loading = computed(
  () =>
    timeline.status.value === 'pending' &&
    !timeline.pinned.value.length &&
    !timeline.posts.value.length,
);

// The posts with an action running: a second click on one of them waits, others stay live.
const busy = ref(new Set<string>());

async function run(post: FeedPostView, action: () => Promise<void>) {
  if (busy.value.has(post.id)) return;
  busy.value.add(post.id);
  try {
    await action();
  } catch (error) {
    if (error instanceof FeedError && error.problem === 'notFound') timeline.remove(post.id);
    toasts.failed(error);
  } finally {
    busy.value.delete(post.id);
  }
}

const onLike = (post: FeedPostView) =>
  run(post, async () => {
    const result = await feedActions.setLiked(post.id, !post.liked);
    timeline.update(post.id, { likes: result.likes, liked: result.liked });
  });

const onPin = (post: FeedPostView) =>
  run(post, async () => {
    if (post.pinnedAt) {
      await timeline.setPins((await feedActions.unpin(post.id)).pinned);
      toasts.done(t('feed.pin.unpinned'));
      return;
    }
    try {
      await timeline.setPins((await feedActions.pin(post.id)).pinned);
    } catch (error) {
      if (!(error instanceof FeedError) || error.problem !== 'pinLimit') throw error;
      const oldestId = (error.data.oldest as { id?: string } | undefined)?.id;
      const oldest = timeline.pinned.value.find((known) => known.id === oldestId);
      const replace: unknown = await confirm.open({
        title: t('feed.pin.replaceTitle'),
        description: oldest
          ? t('feed.pin.replaceText', { text: oldest.text })
          : t('feed.pin.replaceTextUnknown'),
        confirmLabel: t('feed.pin.replace'),
        cancelLabel: t('feed.cancel'),
      }).result;
      if (replace !== true) return;
      await timeline.setPins((await feedActions.pin(post.id, true)).pinned);
    }
    toasts.done(t('feed.pin.pinned'));
  });

async function onDelete(post: FeedPostView) {
  const confirmed: unknown = await confirm.open({
    title: t('feed.delete.postTitle'),
    description: t('feed.delete.postText'),
    confirmLabel: t('feed.delete.confirm'),
    cancelLabel: t('feed.cancel'),
    destructive: true,
  }).result;
  if (confirmed !== true) return;
  await run(post, async () => {
    await feedActions.remove(post.id);
    timeline.remove(post.id);
    toasts.done(t('feed.delete.postDone'));
  });
}

function onPosted(post: FeedPostView) {
  if (post.feed === feed.value) timeline.prepend(post);
  else feed.value = post.feed;
}

function onAccount(updated: FeedMe) {
  me.value = updated;
}

async function onLoadMore() {
  try {
    await timeline.loadMore();
  } catch (error) {
    toasts.failed(error);
  }
}

function onWrite() {
  composer.value?.$el.scrollIntoView({ block: 'center' });
  composer.value?.$el.querySelector('input')?.focus();
}
</script>

<template>
  <UContainer class="flex max-w-5xl flex-col gap-6 py-10 sm:py-14">
    <div class="flex max-w-2xl flex-col gap-2">
      <h1 class="text-4xl font-bold text-highlighted">{{ t('feed.title') }}</h1>
      <p class="text-lg text-muted">{{ t('feed.lede') }}</p>
    </div>

    <div class="flex items-start gap-8">
      <div class="flex min-w-0 flex-1 flex-col gap-4">
        <UTabs
          v-model="feed"
          :items="tabs"
          :content="false"
          variant="pill"
          class="self-start"
          :aria-label="t('feed.tabs.label')"
        >
          <template #trailing="{ item }">
            <span
              v-if="item.value !== feed && unread[item.value as FeedName]"
              class="size-2 rounded-full bg-inverted"
              role="img"
              :aria-label="t('feed.tabs.unread')"
            />
          </template>
        </UTabs>

        <UAlert
          v-if="meError"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="t('feed.loadFailed')"
        />
        <template v-else-if="me">
          <FeedComposer
            v-if="canPost"
            ref="composer"
            :me="me"
            :feed="feed"
            @posted="onPosted"
            @account="onAccount"
          />
          <p
            v-else-if="canAct && feed === 'announcements'"
            class="flex items-center gap-2 text-muted"
          >
            <UIcon name="i-lucide-info" class="size-4 shrink-0" />
            {{ t('feed.announcementsNote') }}
          </p>
          <FeedStateBand v-else :me="me" />
        </template>

        <UAlert
          v-if="timeline.error.value"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="t('feed.loadFailed')"
          :actions="[
            {
              label: t('feed.retry'),
              color: 'neutral',
              variant: 'outline',
              onClick: () => void timeline.refresh(),
            },
          ]"
        />
        <div
          v-else-if="loading"
          class="flex flex-col gap-4 rounded-lg bg-elevated px-5 py-4"
          :aria-label="t('feed.loading')"
          role="status"
        >
          <div v-for="n in 3" :key="n" class="flex gap-3">
            <USkeleton class="size-10 rounded-sm bg-accented" />
            <div class="flex flex-1 flex-col gap-2">
              <USkeleton class="h-4 w-40 bg-accented" />
              <USkeleton class="h-4 w-full bg-accented" />
            </div>
          </div>
        </div>
        <FeedEmpty v-else-if="empty" :feed="feed" :can-post="canPost" @write="onWrite" />
        <div v-else class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
          <FeedPost
            v-for="post in [...timeline.pinned.value, ...timeline.posts.value]"
            :key="post.id"
            :post="post"
            :can-act="canAct"
            :busy="busy.has(post.id)"
            @like="onLike"
            @pin="onPin"
            @delete="onDelete"
          />
          <div v-if="timeline.next.value" class="flex justify-center p-3.5">
            <UButton
              color="neutral"
              variant="outline"
              size="md"
              :label="t('feed.loadMore')"
              :loading="timeline.loadingMore.value"
              @click="onLoadMore"
            />
          </div>
        </div>
      </div>

      <FeedAside class="w-75 shrink-0 max-lg:hidden" />
    </div>
  </UContainer>
</template>
