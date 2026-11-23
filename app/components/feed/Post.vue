<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';

import type { FeedPostView } from '#shared/schemas/feed';

// One post or reply of the Feed (docs/feed.md, "The Feed page"; docs/design.md, Feed): the
// Minecraft head or the anonymous mask, the name, the announcer badge, the handle and the age, the
// reply-to and private lines, the text, then replies, the like and, for announcers, the pin.
const props = withDefaults(
  defineProps<{
    post: FeedPostView;
    /** `list` in a feed, `main` heading its thread, `reply` in a thread. */
    mode?: 'list' | 'main' | 'reply';
    /** Liking and replying are live; otherwise the counts are shown, static. */
    canAct?: boolean;
    /** An action of this post is running. */
    busy?: boolean;
  }>(),
  { mode: 'list', canAct: false, busy: false },
);

const emit = defineEmits<{
  like: [post: FeedPostView];
  pin: [post: FeedPostView];
  delete: [post: FeedPostView];
  reply: [post: FeedPostView];
}>();

const { t, locale } = useI18n();

const author = computed(() => props.post.author);
const anonymous = computed(() => props.post.anonymous);
const name = computed(() =>
  anonymous.value || !author.value ? t('feed.post.anonymous') : feedDisplayName(author.value),
);
const handle = computed(() => (anonymous.value || !author.value ? null : feedHandle(author.value)));
const announcer = computed(() => !anonymous.value && author.value?.announcer === true);

/** The lock line: the author's own anonymous post, or the real author for a moderator. */
const privateLine = computed(() => {
  if (!anonymous.value || !author.value) return null;
  if (props.post.mine) return t('feed.post.privateMine');
  const shown = [feedDisplayName(author.value), feedHandle(author.value)].filter(Boolean);
  return t('feed.post.privateAuthor', { name: shown.join(' ') });
});

const replyToLine = computed(() => {
  const target = props.post.replyTo;
  if (!target) return null;
  return t('feed.post.replyTo', { name: target.name ?? t('feed.post.anonymous') });
});

// The page's clock (useFeedClock): the server's render and the browser's first one agree, then it
// moves on while the page stays open.
const now = useFeedNow();
const age = computed(
  () => formatFeedAge(props.post.createdAt, locale.value, now.value) ?? t('feed.post.now'),
);
const fullDate = computed(() => formatFeedDate(props.post.createdAt, locale.value));

const threadLink = computed(() => `/minecraft/feed/${props.post.threadId ?? props.post.id}`);
const showUnseen = computed(() => props.mode === 'list' && props.post.unseenReplies > 0);
const showPin = computed(() => props.post.canPin && props.mode !== 'reply');
const pinned = computed(() => props.post.pinnedAt !== null);

const menu = computed<DropdownMenuItem[]>(() => [
  {
    label: t('feed.post.delete'),
    icon: 'i-lucide-trash-2',
    color: 'error',
    onSelect: () => {
      emit('delete', props.post);
    },
  },
]);

/** Lucide's heart, filled for a liked post. */
const filled = (content: string) => content.replaceAll('fill="none"', 'fill="currentColor"');
</script>

<template>
  <article
    :class="['flex flex-col gap-0.5 px-4 pt-3.5 pb-2 sm:px-5 sm:pt-4 sm:pb-2.5']"
    :aria-label="t('feed.post.label', { name })"
  >
    <p
      v-if="pinned && props.mode !== 'reply'"
      class="mb-1 flex items-center gap-1.5 pl-13 text-sm font-semibold text-muted"
    >
      <UIcon name="i-lucide-pin" class="size-4" />
      {{ t('feed.post.pinned') }}
    </p>
    <div class="flex items-start gap-3">
      <FeedAnonymousAvatar v-if="anonymous || !author" />
      <WardenMinecraftHead v-else :uuid="author.uuid" />
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <div class="flex h-6 min-w-0 items-center gap-1.5">
          <span
            :class="[
              'min-w-0 shrink truncate font-semibold',
              anonymous ? 'text-muted' : 'text-highlighted',
            ]"
          >
            {{ name }}
          </span>
          <FeedAnnouncerBadge v-if="announcer" />
          <span v-if="handle" class="min-w-0 shrink-20 truncate text-muted">{{ handle }}</span>
          <time
            v-if="props.mode !== 'main'"
            :datetime="props.post.createdAt"
            :title="fullDate"
            class="ms-auto shrink-0 ps-1.5 text-sm whitespace-nowrap text-muted tabular-nums"
          >
            {{ age }}
          </time>
          <UDropdownMenu v-if="props.post.canDelete" :items="menu" :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="ghost"
              size="md"
              square
              icon="i-lucide-ellipsis"
              :class="['-me-1.5 text-muted', props.mode === 'main' ? 'ms-auto' : '']"
              :aria-label="t('feed.post.more')"
            />
          </UDropdownMenu>
        </div>
        <p v-if="replyToLine" class="flex min-w-0 items-center gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-corner-down-right" class="size-4 shrink-0" />
          <span class="truncate">{{ replyToLine }}</span>
        </p>
        <p v-if="privateLine" class="flex min-w-0 items-center gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-lock" class="size-4 shrink-0" />
          <span class="truncate">{{ privateLine }}</span>
        </p>
        <p
          :class="[
            'wrap-anywhere whitespace-pre-wrap text-default',
            props.mode === 'main' ? 'text-lg' : '',
          ]"
        >
          {{ props.post.text }}
        </p>
        <p v-if="props.mode === 'main'" class="mt-1.5 text-sm text-muted tabular-nums">
          <time :datetime="props.post.createdAt">{{ fullDate }}</time>
        </p>

        <div class="-ms-2 mt-0.5 flex items-center gap-3">
          <!-- Replies: a feed opens the thread; a thread answers this post. -->
          <UButton
            v-if="props.mode === 'list'"
            :to="threadLink"
            color="neutral"
            variant="ghost"
            size="md"
            icon="i-lucide-message-circle"
            class="text-muted tabular-nums"
            :aria-label="t('feed.post.replies', { count: props.post.replies }, props.post.replies)"
          >
            <span v-if="props.post.replies">{{ props.post.replies }}</span>
            <UBadge
              v-if="showUnseen"
              color="neutral"
              variant="soft"
              size="md"
              :label="
                t('feed.post.unseen', { count: props.post.unseenReplies }, props.post.unseenReplies)
              "
            />
          </UButton>
          <UButton
            v-else-if="props.canAct"
            color="neutral"
            variant="ghost"
            size="md"
            icon="i-lucide-message-circle"
            class="text-muted tabular-nums"
            :label="props.post.replies ? String(props.post.replies) : undefined"
            :aria-label="t('feed.post.reply')"
            @click="emit('reply', props.post)"
          />
          <span
            v-else
            class="inline-flex h-8 items-center gap-1.5 px-2 text-sm text-muted tabular-nums"
            :aria-label="t('feed.post.replies', { count: props.post.replies }, props.post.replies)"
          >
            <UIcon name="i-lucide-message-circle" class="size-5" />
            <span v-if="props.post.replies">{{ props.post.replies }}</span>
          </span>

          <UButton
            v-if="props.canAct"
            color="neutral"
            :variant="props.post.liked ? 'soft' : 'ghost'"
            size="md"
            :class="['tabular-nums', props.post.liked ? 'text-highlighted' : 'text-muted']"
            :aria-pressed="props.post.liked"
            :aria-label="t('feed.post.like', { count: props.post.likes }, props.post.likes)"
            :disabled="props.busy"
            @click="emit('like', props.post)"
          >
            <UIcon
              name="i-lucide-heart"
              mode="svg"
              :customize="props.post.liked ? filled : undefined"
              class="size-5"
            />
            <span v-if="props.post.likes">{{ props.post.likes }}</span>
          </UButton>
          <span
            v-else
            class="inline-flex h-8 items-center gap-1.5 px-2 text-sm text-muted tabular-nums"
            :aria-label="t('feed.post.like', { count: props.post.likes }, props.post.likes)"
          >
            <UIcon name="i-lucide-heart" class="size-5" />
            <span v-if="props.post.likes">{{ props.post.likes }}</span>
          </span>

          <UButton
            v-if="showPin"
            color="neutral"
            :variant="pinned ? 'soft' : 'ghost'"
            size="md"
            square
            :class="['ms-auto', pinned ? 'text-highlighted' : 'text-muted']"
            :aria-pressed="pinned"
            :aria-label="t(pinned ? 'feed.post.unpin' : 'feed.post.pin')"
            :disabled="props.busy"
            @click="emit('pin', props.post)"
          >
            <UTooltip :text="t(pinned ? 'feed.post.unpin' : 'feed.post.pin')">
              <UIcon
                name="i-lucide-pin"
                mode="svg"
                :customize="pinned ? filled : undefined"
                class="size-5"
              />
            </UTooltip>
          </UButton>
        </div>
      </div>
    </div>
  </article>
</template>
