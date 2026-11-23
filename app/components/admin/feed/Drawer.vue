<script setup lang="ts">
import { AdminFeedDeleteModal } from '#components';

import type { FeedAdminPost, FeedPostView } from '#shared/schemas/feed';

// One row of the Feed table in a side drawer, opened by `?post=<id>` so it can be linked
// (docs/feed.md, "Moderation"; mock M1): the real author with a link to their Person page, the
// text, the facts, the discussion around the row and Delete, outline and never solid.
const emit = defineEmits<{ deleted: [] }>();

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const overlay = useOverlay();
const { user: me } = useAuth();
const deleteModal = overlay.create(AdminFeedDeleteModal);

const postId = computed(() => feedAdminStateFromQuery(route.query).post);
const open = computed({
  get: () => postId.value !== null,
  set: (value: boolean) => {
    if (!value) void router.push({ query: { ...route.query, post: undefined } });
  },
});

const { data, error, status, refresh } = await useFeedAdminRow(postId);
const row = computed(() => (data.value?.post.id === postId.value ? data.value.post : null));
const thread = computed(() => data.value?.thread ?? null);
const missing = computed(
  () => (error.value as { statusCode?: number } | null | undefined)?.statusCode === 404,
);

const isReply = computed(() => row.value?.threadId !== null);
const title = computed(() => {
  const value = row.value;
  if (!value) return t('admin.feed.drawer.loading');
  const kind = value.threadId ? 'reply' : value.feed === 'announcements' ? 'announcement' : 'post';
  return t(`admin.feed.drawer.titles.${value.anonymous ? 'anonymous' : 'plain'}.${kind}`);
});

const name = (post: FeedAdminPost) => feedDisplayName(post.author);
const handle = (post: FeedAdminPost) => feedHandle(post.author);
const fullDate = (iso: string) => formatFeedDate(iso, locale.value);
const day = (iso: string) => formatFeedAdminDay(iso, locale.value);

/** What the row answers: the reply it names, or the main post. */
const answered = computed(() => {
  const value = row.value;
  const current = thread.value;
  if (!value?.threadId || !current) return null;
  if (value.replyToGone) return { name: t('admin.feed.drawer.answeredGone'), text: null };
  const replyTo = value.replyTo;
  // A reply to a reply names it (gone once purged); a reply to the main post names nothing.
  const who = replyTo
    ? (current.replies.find((reply) => replyTo.id !== null && reply.id === replyTo.id) ?? null)
    : current.post;
  const anonymous = who ? who.anonymous : (replyTo?.anonymous ?? false);
  return {
    name: anonymous ? t('feed.post.anonymous') : who ? name(who) : (replyTo?.name ?? null),
    text: who?.text ?? null,
  };
});

const deleter = computed(() => (row.value ? feedAdminDeleter(row.value) : null));
const deletedLine = computed(() => {
  const value = row.value;
  const who = deleter.value;
  if (!value?.deletedAt || !who) return null;
  const date = formatFeedAdminDate(value.deletedAt, locale.value);
  return who.kind === 'moderator'
    ? t('admin.feed.state.by', { name: who.name, date })
    : t(`admin.feed.state.${who.kind}`, { date });
});

/** The admin row as the Feed page's post component reads it: no viewer, nothing to act on. */
function asView(post: FeedAdminPost): FeedPostView {
  return {
    ...post,
    liked: false,
    mine: false,
    canDelete: false,
    canPin: false,
    unseenReplies: 0,
    answersMe: false,
  };
}

const around = computed(() =>
  thread.value && row.value ? feedAdminAround(thread.value.replies, row.value.id) : null,
);

const deleting = ref(false);
async function onDelete() {
  const value = row.value;
  if (!value) return;
  const liveReplies = value.threadId
    ? 0
    : (thread.value?.replies.filter((reply) => !reply.deletedAt).length ?? 0);
  const reason: unknown = await deleteModal.open({
    reply: value.threadId !== null,
    replies: liveReplies,
    own: value.authorUserId === me.value?.id,
  }).result;
  if (typeof reason !== 'string') return;
  deleting.value = true;
  try {
    await feedAdminActions.remove(value.id, reason);
    toast.add({
      title: t(value.threadId ? 'admin.feed.delete.replyDone' : 'admin.feed.delete.postDone'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('deleted');
  } catch (failure) {
    const problem = failure instanceof FeedError ? failure.problem : 'failed';
    toast.add({
      title: t(
        `admin.feed.errors.${problem === 'notFound' || problem === 'notAllowed' ? problem : 'failed'}`,
      ),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    deleting.value = false;
  }
  await refresh();
}
</script>

<template>
  <USlideover v-model:open="open" :title="title" :ui="{ content: 'w-full max-w-xl' }">
    <template #body>
      <UAlert
        v-if="missing"
        color="neutral"
        variant="subtle"
        icon="i-lucide-archive-x"
        :description="t('admin.feed.drawer.missing')"
      />
      <UAlert
        v-else-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="t('admin.feed.drawer.failed')"
      />
      <div v-else-if="!row" class="flex flex-col gap-3" :aria-busy="status === 'pending'">
        <USkeleton class="h-20 w-full" />
        <USkeleton class="h-6 w-3/4" />
        <USkeleton class="h-6 w-1/2" />
      </div>
      <div v-else class="flex flex-col gap-6">
        <div class="flex items-center gap-4 rounded-lg bg-elevated px-4 py-3.5">
          <WardenMinecraftHead :uuid="row.author.uuid" />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="font-semibold break-words text-highlighted">
              {{ name(row) }}
              <span v-if="handle(row)" class="font-normal text-muted">{{ handle(row) }}</span>
            </span>
            <span class="flex items-center gap-1.5 text-sm text-muted">
              <UIcon v-if="row.anonymous" name="i-lucide-lock" class="size-4 shrink-0" />
              {{ t(row.anonymous ? 'admin.feed.drawer.realAuthor' : 'admin.feed.drawer.author') }}
            </span>
          </div>
          <UButton
            color="neutral"
            variant="soft"
            size="md"
            :to="`/admin/people/${encodeURIComponent(row.authorUserId)}/summary`"
            :label="t('admin.feed.drawer.openProfile')"
          />
        </div>

        <UAlert
          v-if="deletedLine"
          color="neutral"
          variant="subtle"
          icon="i-lucide-trash-2"
          :title="deletedLine"
          :description="
            row.purgeAt ? t('admin.feed.state.purge', { date: day(row.purgeAt) }) : undefined
          "
        />

        <p
          :class="[
            'text-lg wrap-anywhere whitespace-pre-wrap',
            row.deletedAt ? 'text-muted' : 'text-default',
          ]"
        >
          {{ row.text }}
        </p>

        <dl class="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
          <dt class="text-muted">{{ t('admin.feed.drawer.facts.feed') }}</dt>
          <dd class="col-span-2 text-highlighted">
            {{
              row.pinnedAt
                ? t('admin.feed.drawer.pinnedIn', { feed: t(`admin.feed.feeds.${row.feed}`) })
                : t(`admin.feed.feeds.${row.feed}`)
            }}
          </dd>
          <template v-if="answered">
            <dt class="text-muted">{{ t('admin.feed.drawer.facts.replyingTo') }}</dt>
            <dd class="col-span-2 break-words text-highlighted">
              {{
                answered.text
                  ? t('admin.feed.drawer.answered', {
                      name: answered.name ?? t('admin.feed.drawer.unknown'),
                      text: answered.text,
                    })
                  : (answered.name ?? t('admin.feed.drawer.unknown'))
              }}
            </dd>
          </template>
          <dt class="text-muted">{{ t('admin.feed.drawer.facts.posted') }}</dt>
          <dd class="col-span-2 text-highlighted tabular-nums">{{ fullDate(row.createdAt) }}</dd>
          <dt class="text-muted">{{ t('admin.feed.drawer.facts.account') }}</dt>
          <dd class="col-span-2 break-all text-highlighted">{{ row.author.username }}</dd>
          <dt class="text-muted">{{ t('admin.feed.drawer.facts.source') }}</dt>
          <dd class="col-span-2 text-highlighted">
            {{ t(`admin.feed.drawer.sources.${row.source}`) }}
          </dd>
          <dt class="text-muted">{{ t('admin.feed.drawer.facts.likes') }}</dt>
          <dd class="col-span-2 text-highlighted tabular-nums">{{ row.likes }}</dd>
          <dt class="text-muted">{{ t('admin.feed.drawer.facts.replies') }}</dt>
          <dd class="col-span-2 text-highlighted tabular-nums">{{ row.replies }}</dd>
          <template v-if="row.deletedReason">
            <dt class="text-muted">{{ t('admin.feed.drawer.facts.reason') }}</dt>
            <dd class="col-span-2 break-words text-highlighted">{{ row.deletedReason }}</dd>
          </template>
        </dl>

        <section
          v-if="thread && around && (row.threadId || thread.replies.length)"
          class="flex flex-col gap-2"
        >
          <h3 class="text-base font-semibold text-highlighted">
            {{ t('admin.feed.drawer.discussion') }}
          </h3>
          <div class="flex flex-col divide-y divide-default overflow-hidden rounded-lg bg-elevated">
            <div
              v-for="item in [
                { post: thread.post, kind: 'main' },
                ...around.shown.map((post) => ({ post, kind: 'reply' })),
              ]"
              :key="item.post.id"
              :class="item.post.id === row.id ? 'bg-secondary/10' : ''"
              :aria-current="item.post.id === row.id ? 'true' : undefined"
            >
              <div :class="item.post.deletedAt ? 'opacity-60' : ''">
                <FeedPost :post="asView(item.post)" mode="reply" />
              </div>
              <p
                v-if="item.post.deletedAt"
                class="flex items-center gap-1.5 px-4 pb-3 pl-17 text-sm text-muted sm:px-5 sm:pl-18"
              >
                <UIcon name="i-lucide-trash-2" class="size-4 shrink-0" />
                {{ t('admin.feed.state.deleted') }}
              </p>
              <p
                v-if="item.kind === 'main' && around.before"
                class="border-t border-default px-5 py-2 text-sm text-muted tabular-nums"
              >
                {{ t('admin.feed.drawer.earlier', { count: around.before }, around.before) }}
              </p>
            </div>
            <p v-if="around.after" class="px-5 py-2 text-sm text-muted tabular-nums">
              {{ t('admin.feed.drawer.later', { count: around.after }, around.after) }}
            </p>
          </div>
        </section>

        <div v-if="!row.deletedAt" class="flex flex-wrap gap-3">
          <UButton
            color="error"
            variant="outline"
            icon="i-lucide-trash-2"
            :loading="deleting"
            :label="t(isReply ? 'admin.feed.drawer.deleteReply' : 'admin.feed.drawer.deletePost')"
            @click="onDelete"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
