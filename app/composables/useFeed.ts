import type {
  FeedCreated,
  FeedLikeResult,
  FeedMe,
  FeedName,
  FeedPage,
  FeedPinsResult,
  FeedPostBody,
  FeedPostView,
  FeedProblem,
  FeedReplyBody,
  FeedThread,
} from '#shared/schemas/feed';
import { FEED_PROBLEMS } from '#shared/schemas/feed';

// The Feed page (/minecraft/feed) and its threads (/minecraft/feed/:id). Reads with useFetch,
// writes as plain functions that throw a FeedError with the API's problem. See docs/feed.md.

export class FeedError extends Error {
  constructor(
    readonly problem: FeedProblem | 'failed',
    /** The refusal's `data`: `oldest` for `pinLimit`, `retryAfter` for `rateLimited`. */
    readonly data: Record<string, unknown> = {},
  ) {
    super(`Feed request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const data = (error as { data?: { data?: Record<string, unknown> } }).data?.data;
    const problem = data?.problem;
    throw new FeedError(
      FEED_PROBLEMS.includes(problem as FeedProblem) ? (problem as FeedProblem) : 'failed',
      data ?? {},
    );
  }
}

/** The signed-in person's rights, ban, unread dots and posting account. */
export function useFeedMe() {
  return useFetch<FeedMe>('/api/feed/me', { key: 'feed-me' });
}

/**
 * A feed for the page: its first page from useFetch, then the older pages "Load more" adds, and
 * the changes the page's own actions make (likes, pins, deletes, a new post).
 */
export async function useFeedTimeline(feed: Ref<FeedName>) {
  const fetched = await useFetch<FeedPage>('/api/feed/posts', {
    key: () => `feed-page-${feed.value}`,
    query: { feed },
  });
  const pinned = ref<FeedPostView[]>([]);
  const posts = ref<FeedPostView[]>([]);
  const next = ref<string | null>(null);
  const loadingMore = ref(false);

  // While another tab's page loads, useFetch may still hold the last one: show nothing of it.
  watch(
    [fetched.data, feed],
    ([page, name]) => {
      const shown = page?.feed === name ? page : null;
      pinned.value = shown?.pinned ?? [];
      posts.value = shown?.posts ?? [];
      next.value = shown?.next ?? null;
    },
    { immediate: true },
  );

  /** Adds the next page of older posts. Throws a FeedError. */
  async function loadMore() {
    if (!next.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
      const page = await call(() =>
        $fetch<FeedPage>('/api/feed/posts', { query: { feed: feed.value, before: next.value } }),
      );
      posts.value = appendFeedPosts(posts.value, page.posts);
      next.value = page.next;
    } finally {
      loadingMore.value = false;
    }
  }

  function update(id: string, patch: Partial<FeedPostView>) {
    const apply = (list: FeedPostView[]) =>
      list.map((post) => (post.id === id ? { ...post, ...patch } : post));
    pinned.value = apply(pinned.value);
    posts.value = apply(posts.value);
  }

  function remove(id: string) {
    pinned.value = pinned.value.filter((post) => post.id !== id);
    posts.value = posts.value.filter((post) => post.id !== id);
  }

  function prepend(post: FeedPostView) {
    posts.value = [post, ...posts.value.filter((known) => known.id !== post.id)];
  }

  /** The pinned group after a pin or unpin; reloads when it names a post the page lacks. */
  async function setPins(group: { id: string; pinnedAt: string }[]) {
    const applied = applyFeedPins({ pinned: pinned.value, posts: posts.value }, group);
    if (applied) {
      pinned.value = applied.pinned;
      posts.value = applied.posts;
    } else {
      await fetched.refresh();
    }
  }

  return {
    status: fetched.status,
    error: fetched.error,
    refresh: fetched.refresh,
    page: fetched.data,
    pinned,
    posts,
    next,
    loadingMore,
    loadMore,
    update,
    remove,
    prepend,
    setPins,
  };
}

/** A thread: its main post, then its replies, oldest first, with "Load more replies". */
export async function useFeedThread(id: string) {
  const fetched = await useFetch<FeedThread>(`/api/feed/posts/${id}`, {
    key: `feed-thread-${id}`,
  });
  const post = ref<FeedPostView | null>(null);
  const replies = ref<FeedPostView[]>([]);
  const next = ref<string | null>(null);
  const loadingMore = ref(false);

  watch(
    fetched.data,
    (thread) => {
      post.value = thread?.post ?? null;
      replies.value = thread?.replies ?? [];
      next.value = thread?.next ?? null;
    },
    { immediate: true },
  );

  async function loadMore() {
    if (!next.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
      const page = await call(() =>
        $fetch<FeedThread>(`/api/feed/posts/${id}`, { query: { after: next.value } }),
      );
      replies.value = appendFeedPosts(replies.value, page.replies);
      next.value = page.next;
    } finally {
      loadingMore.value = false;
    }
  }

  function update(postId: string, patch: Partial<FeedPostView>) {
    if (post.value?.id === postId) post.value = { ...post.value, ...patch };
    replies.value = replies.value.map((reply) =>
      reply.id === postId ? { ...reply, ...patch } : reply,
    );
  }

  /** A reply just posted: at the end, with the counts it changes. */
  function addReply(reply: FeedPostView) {
    if (replies.value.some((known) => known.id === reply.id)) return;
    // With more replies still to load, it arrives with them.
    if (!next.value) replies.value = [...replies.value, reply];
    if (post.value) post.value = { ...post.value, replies: post.value.replies + 1 };
    const answered = reply.replyTo?.id;
    if (answered) {
      replies.value = replies.value.map((known) =>
        known.id === answered ? { ...known, replies: known.replies + 1 } : known,
      );
    }
  }

  return {
    status: fetched.status,
    error: fetched.error,
    refresh: fetched.refresh,
    post,
    replies,
    next,
    loadingMore,
    loadMore,
    update,
    addReply,
  };
}

/** The page's writes. Each throws a FeedError. */
export const feedActions = {
  setPostingAccount: (uuid: string) =>
    call(() => $fetch<FeedMe>('/api/feed/me', { method: 'PATCH', body: { postingAccount: uuid } })),
  post: (body: FeedPostBody) =>
    call(() => $fetch<FeedCreated>('/api/feed/posts', { method: 'POST', body })),
  reply: (threadId: string, body: FeedReplyBody) =>
    call(() =>
      $fetch<FeedCreated>(`/api/feed/posts/${threadId}/replies`, { method: 'POST', body }),
    ),
  setLiked: (id: string, liked: boolean) =>
    call(() =>
      $fetch<FeedLikeResult>(`/api/feed/posts/${id}/like`, { method: liked ? 'PUT' : 'DELETE' }),
    ),
  pin: (id: string, replace = false) =>
    call(() =>
      $fetch<FeedPinsResult>(`/api/feed/posts/${id}/pin`, { method: 'PUT', body: { replace } }),
    ),
  unpin: (id: string) =>
    call(() => $fetch<FeedPinsResult>(`/api/feed/posts/${id}/pin`, { method: 'DELETE' })),
  remove: (id: string) => call(() => $fetch(`/api/feed/posts/${id}`, { method: 'DELETE' })),
  markFeedSeen: (feed: FeedName, upTo: string) =>
    call(() => $fetch('/api/feed/seen', { method: 'POST', body: { feed, upTo } })),
  markThreadSeen: (id: string) =>
    call(() => $fetch(`/api/feed/posts/${id}/seen`, { method: 'POST' })),
};

/** Problems with their own message; anything else says the request didn't go through. */
const FEED_MESSAGES: readonly string[] = [
  'notFound',
  'notLinked',
  'banned',
  'notAllowed',
  'emptyText',
  'tooLong',
  'notPinnable',
  'rateLimited',
  'disabled',
];

/** The page's toasts: what worked, and what a refusal means and how to fix it. */
export function useFeedToasts() {
  const { t } = useI18n();
  const toast = useToast();
  return {
    done(title: string) {
      toast.add({ title, color: 'success', icon: 'i-lucide-circle-check' });
    },
    failed(error: unknown) {
      const problem = error instanceof FeedError ? error.problem : 'failed';
      const retryAfter = error instanceof FeedError ? Number(error.data.retryAfter) : NaN;
      toast.add({
        title: t(`feed.errors.${FEED_MESSAGES.includes(problem) ? problem : 'failed'}`, {
          seconds: Number.isFinite(retryAfter) ? retryAfter : 60,
        }),
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    },
  };
}

/** Whether the person may post, reply and like now: linked, not banned, writing on. */
export function canWriteFeed(me: FeedMe | null | undefined): boolean {
  return Boolean(me?.linked && me.rights.write && me.writing);
}
