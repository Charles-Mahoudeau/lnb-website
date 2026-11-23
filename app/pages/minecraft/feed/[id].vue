<script setup lang="ts">
import { WardenConfirmModal } from '#components';

import type { FeedPostView } from '#shared/schemas/feed';

// A thread as its own page (docs/feed.md, "The Feed page"): the main post with its full date,
// the replies oldest first, then the reply composer, docked at the bottom on phones. Opening it
// marks the thread seen. A deleted or unknown post says so, with the way back.
definePageMeta({ flag: 'feed' });

const { t } = useI18n();
const route = useRoute();
const overlay = useOverlay();
const toasts = useFeedToasts();
const confirm = overlay.create(WardenConfirmModal);

const id = String(route.params.id);
const { data: me } = await useFeedMe();
const thread = await useFeedThread(id);
const main = thread.post;

useSeoMeta({ title: () => t('feed.thread.title'), robots: 'noindex' });

const canAct = computed(() => canWriteFeed(me.value));
const gone = computed(
  () =>
    thread.error.value?.status === 404 ||
    (!main.value && !thread.error.value && thread.status.value === 'success'),
);
const backLink = computed(() =>
  main.value?.feed === 'global' ? '/minecraft/feed?feed=global' : '/minecraft/feed',
);
const mainName = computed(() =>
  main.value?.anonymous || !main.value?.author
    ? t('feed.post.anonymous')
    : feedDisplayName(main.value.author),
);

// Seen once shown: the markers were computed before this, so the page still shows them.
onMounted(() => {
  if (main.value) feedActions.markThreadSeen(id).catch(() => {});
});

const target = ref<{ id: string; name: string } | null>(null);
const replyComposer = useTemplateRef<{ focus: () => void }>('replyComposer');

function onReply(post: FeedPostView) {
  target.value =
    post.threadId === null
      ? null
      : {
          id: post.id,
          name:
            post.anonymous || !post.author
              ? t('feed.post.anonymous')
              : feedDisplayName(post.author),
        };
  replyComposer.value?.focus();
}

function onReplied(post: FeedPostView) {
  thread.addReply(post);
  target.value = null;
}

const busy = ref<string | null>(null);

async function run(post: FeedPostView, action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = post.id;
  try {
    await action();
  } catch (error) {
    toasts.failed(error);
    if (error instanceof FeedError && error.problem === 'notFound') await thread.refresh();
  } finally {
    busy.value = null;
  }
}

const onLike = (post: FeedPostView) =>
  run(post, async () => {
    const result = await feedActions.setLiked(post.id, !post.liked);
    thread.update(post.id, { likes: result.likes, liked: result.liked });
  });

const onPin = (post: FeedPostView) =>
  run(post, async () => {
    if (post.pinnedAt) {
      await feedActions.unpin(post.id);
      thread.update(post.id, { pinnedAt: null });
      toasts.done(t('feed.pin.unpinned'));
      return;
    }
    let result;
    try {
      result = await feedActions.pin(post.id);
    } catch (error) {
      if (!(error instanceof FeedError) || error.problem !== 'pinLimit') throw error;
      const replace: unknown = await confirm.open({
        title: t('feed.pin.replaceTitle'),
        description: t('feed.pin.replaceTextUnknown'),
        confirmLabel: t('feed.pin.replace'),
        cancelLabel: t('feed.cancel'),
      }).result;
      if (replace !== true) return;
      result = await feedActions.pin(post.id, true);
    }
    const pin = result.pinned.find((known) => known.id === post.id);
    thread.update(post.id, { pinnedAt: pin?.pinnedAt ?? null });
    toasts.done(t('feed.pin.pinned'));
  });

async function onDelete(post: FeedPostView) {
  const isMain = post.threadId === null;
  const confirmed: unknown = await confirm.open({
    title: t(isMain ? 'feed.delete.postTitle' : 'feed.delete.replyTitle'),
    description: t(isMain ? 'feed.delete.postText' : 'feed.delete.replyText'),
    confirmLabel: t('feed.delete.confirm'),
    cancelLabel: t('feed.cancel'),
    destructive: true,
  }).result;
  if (confirmed !== true) return;
  await run(post, async () => {
    await feedActions.remove(post.id);
    toasts.done(t(isMain ? 'feed.delete.postDone' : 'feed.delete.replyDone'));
    if (isMain) await navigateTo(backLink.value);
    else await thread.refresh();
  });
}

async function onLoadMore() {
  try {
    await thread.loadMore();
  } catch (error) {
    toasts.failed(error);
  }
}
</script>

<template>
  <UContainer class="flex max-w-5xl flex-col gap-6 pt-8 sm:py-14">
    <div class="flex items-start gap-8">
      <div class="flex min-w-0 flex-1 flex-col gap-4">
        <ULink
          :to="backLink"
          class="flex items-center gap-1.5 self-start font-medium text-primary hover:underline"
        >
          <UIcon name="i-lucide-arrow-left" class="size-4" />
          {{ t('feed.thread.back') }}
        </ULink>

        <div
          v-if="gone"
          class="flex flex-col items-center gap-2.5 rounded-lg bg-elevated px-6 py-12 text-center"
          role="status"
        >
          <IconTile icon="i-lucide-message-square-off" />
          <h1 class="text-lg font-bold text-highlighted">{{ t('feed.thread.goneTitle') }}</h1>
          <p class="max-w-md text-muted">{{ t('feed.thread.goneText') }}</p>
          <UButton
            color="neutral"
            variant="soft"
            :label="t('feed.thread.goneBack')"
            :to="backLink"
            class="mt-1"
          />
        </div>

        <UAlert
          v-else-if="thread.error.value"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="t('feed.loadFailed')"
          :actions="[
            {
              label: t('feed.retry'),
              color: 'neutral',
              variant: 'outline',
              onClick: () => void thread.refresh(),
            },
          ]"
        />

        <template v-else-if="main">
          <h1 class="sr-only">{{ t('feed.thread.heading', { name: mainName }) }}</h1>
          <section class="flex flex-col overflow-hidden rounded-lg bg-elevated">
            <FeedPost
              :post="main"
              mode="main"
              :can-act="canAct"
              :busy="busy === main.id"
              @like="onLike"
              @pin="onPin"
              @delete="onDelete"
              @reply="onReply"
            />
            <p class="border-t border-default px-4 py-2.5 text-sm text-muted sm:px-5">
              {{
                main.replies
                  ? t('feed.thread.count', { count: main.replies }, main.replies)
                  : t('feed.thread.none')
              }}
            </p>
            <div class="flex flex-col divide-y divide-default border-t border-default">
              <FeedPost
                v-for="reply in thread.replies.value"
                :key="reply.id"
                :post="reply"
                mode="reply"
                :can-act="canAct"
                :busy="busy === reply.id"
                @like="onLike"
                @delete="onDelete"
                @reply="onReply"
              />
            </div>
            <div v-if="thread.next.value" class="flex justify-center border-t border-default p-3.5">
              <UButton
                color="neutral"
                variant="outline"
                size="md"
                :label="t('feed.thread.moreReplies')"
                :loading="thread.loadingMore.value"
                @click="onLoadMore"
              />
            </div>
          </section>

          <section
            v-if="canAct"
            class="sticky bottom-0 z-10 -mx-4 border-t border-default bg-default px-4 py-3 sm:static sm:mx-0 sm:rounded-lg sm:border-0 sm:bg-elevated sm:px-5 sm:py-4"
          >
            <FeedReplyComposer
              ref="replyComposer"
              :thread-id="main.id"
              :main-name="mainName"
              :target="target"
              @posted="onReplied"
              @clear="target = null"
            />
          </section>
          <FeedStateBand v-else-if="me" :me="me" />
        </template>
      </div>

      <FeedAside class="w-75 shrink-0 max-lg:hidden" />
    </div>
  </UContainer>
</template>
