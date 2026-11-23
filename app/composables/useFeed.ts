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

/**
 * The seconds a 429 asks to wait: the body's `retryAfter` (the per-account limits of the
 * services), else the `Retry-After` header, which is all the site's rate-limit middleware sends.
 */
function retryAfterOf(error: unknown, data: Record<string, unknown> | undefined): number | null {
  if (typeof data?.retryAfter === 'number') return data.retryAfter;
  const headers = (error as { response?: { headers?: Partial<Headers> } } | null)?.response
    ?.headers;
  const header =
    typeof headers?.get === 'function' ? headers.get('Retry-After')?.trim() : undefined;
  const seconds = header && /^\d+$/.test(header) ? Number(header) : NaN;
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const raw = (error as { data?: { data?: unknown } } | null)?.data?.data;
    const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
    const problem = FEED_PROBLEMS.includes(data?.problem as FeedProblem)
      ? (data?.problem as FeedProblem)
      : 'failed';
    const retryAfter = problem === 'rateLimited' ? retryAfterOf(error, data) : null;
    throw new FeedError(problem, {
      ...data,
      ...(retryAfter === null ? {} : { retryAfter }),
    });
  }
}

/**
 * Where the live stream of the page shown starts: the newest event ID the site read before the
 * page's data (`X-Feed-Event-Id`), kept through the server render. The stream's first opening
 * sends it as Last-Event-ID, so nothing made since the page was read is missed.
 */
export function useFeedEventId() {
  return useState<string | null>('feed-event-id', () => null);
}

/** Keeps the page's `X-Feed-Event-Id` from a read of its data. */
function keepEventId(eventId: Ref<string | null>) {
  return ({ response }: { response: { headers: Headers } }) => {
    const value = response.headers.get('x-feed-event-id');
    if (value && /^\d+$/.test(value)) eventId.value = value;
  };
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
  const eventId = useFeedEventId();
  const fetched = await useFetch<FeedPage>('/api/feed/posts', {
    key: () => `feed-page-${feed.value}`,
    query: { feed },
    onResponse: keepEventId(eventId),
  });
  const pinned = ref<FeedPostView[]>([]);
  const posts = ref<FeedPostView[]>([]);
  const next = ref<string | null>(null);
  /** The feed whose next page is loading, so a tab switched meanwhile doesn't show it busy. */
  const loadingFeed = ref<FeedName | null>(null);
  const loadingMore = computed(() => loadingFeed.value === feed.value);

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

  /**
   * Adds the next page of older posts. Throws a FeedError. A page that arrives once another tab
   * is shown, or once the list was reloaded, is dropped: it belongs to what was shown before.
   */
  async function loadMore() {
    const shown = feed.value;
    const before = next.value;
    if (!before || loadingFeed.value === shown) return;
    loadingFeed.value = shown;
    try {
      const page = await call(() =>
        $fetch<FeedPage>('/api/feed/posts', { query: { feed: shown, before } }),
      );
      if (feed.value !== shown || next.value !== before) return;
      posts.value = appendFeedPosts(posts.value, page.posts);
      next.value = page.next;
    } finally {
      if (loadingFeed.value === shown) loadingFeed.value = null;
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

  /**
   * The pinned group after a pin or unpin. When it names a post the page lacks (pinned elsewhere
   * since), only the group is read again: the posts "Load more" added stay.
   */
  async function setPins(group: { id: string; pinnedAt: string }[]) {
    const applied = applyFeedPins({ pinned: pinned.value, posts: posts.value }, group);
    if (applied) {
      pinned.value = applied.pinned;
      posts.value = applied.posts;
      return;
    }
    const shown = feed.value;
    const first = await call(() =>
      $fetch<FeedPage>('/api/feed/posts', { query: { feed: 'announcements', limit: 1 } }),
    );
    if (feed.value !== shown) return;
    const merged = mergeFeedPinned({ pinned: pinned.value, posts: posts.value }, first.pinned);
    pinned.value = merged.pinned;
    posts.value = merged.posts;
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
  const eventId = useFeedEventId();
  const fetched = await useFetch<FeedThread>(`/api/feed/posts/${id}`, {
    key: `feed-thread-${id}`,
    onResponse: keepEventId(eventId),
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
      replies.value = appendFeedReplies(replies.value, page.replies);
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

  /** A reply deleted (or found gone): out of the list, with the counts it changed. */
  function removeReply(reply: FeedPostView) {
    if (!replies.value.some((known) => known.id === reply.id)) return;
    const answered = reply.replyTo?.id;
    replies.value = replies.value
      .filter((known) => known.id !== reply.id)
      .map((known) =>
        known.id === answered ? { ...known, replies: Math.max(0, known.replies - 1) } : known,
      );
    if (post.value) post.value = { ...post.value, replies: Math.max(0, post.value.replies - 1) };
  }

  /**
   * A reply the live stream announced: at the end, unless more replies are still to load (it
   * comes with them). Its counts come from the stream's own `counts` event.
   */
  function appendLive(reply: FeedPostView) {
    if (next.value || replies.value.some((known) => known.id === reply.id)) return;
    // Events come in commit order, which two replies made at once can swap: keep oldest first.
    replies.value = [...replies.value, reply].sort((a, b) => feedByNewest(b, a));
  }

  /** A reply the live stream says went: out of the list; the counts come with `counts`. */
  function dropReply(replyId: string) {
    replies.value = replies.value.filter((known) => known.id !== replyId);
  }

  /** The thread read again after the stream's `reset`, merged into what the page shows. */
  function merge(fresh: FeedThread) {
    post.value = fresh.post;
    const merged = mergeFeedThread({ replies: replies.value, next: next.value }, fresh);
    replies.value = merged.replies;
    next.value = merged.next;
  }

  /** The main post went: the page shows the thread as deleted. */
  function markGone() {
    post.value = null;
    replies.value = [];
    next.value = null;
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
    removeReply,
    appendLive,
    dropReply,
    merge,
    markGone,
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
];

/**
 * The message key of a refusal. A 503 says whether posting is paused (`feed.writing`) or the
 * whole Feed is off; a failure to send says the draft can be sent again safely, since its key
 * can't post twice; any other failure just says it didn't go through.
 */
export function feedErrorKey(
  error: unknown,
  options: { send?: boolean; sentThenDeleted?: boolean } = {},
): string {
  const problem = error instanceof FeedError ? error.problem : 'failed';
  if (problem === 'notFound' && options.sentThenDeleted) return 'sentThenDeleted';
  if (problem === 'disabled') {
    return error instanceof FeedError && error.data.flag === 'feed.writing'
      ? 'writingPaused'
      : 'unavailable';
  }
  if (FEED_MESSAGES.includes(problem)) return problem;
  return options.send ? 'sendFailed' : 'failed';
}

/** The page's toasts: what worked, and what a refusal means and how to fix it. */
export function useFeedToasts() {
  const { t } = useI18n();
  const toast = useToast();
  return {
    done(title: string) {
      toast.add({ title, color: 'success', icon: 'i-lucide-circle-check' });
    },
    /**
     * `send` for a post or a reply, whose draft can be sent again without posting twice;
     * `sentThenDeleted` for a post whose key answers `notFound`.
     */
    failed(error: unknown, options: { send?: boolean; sentThenDeleted?: boolean } = {}) {
      const retryAfter = error instanceof FeedError ? Number(error.data.retryAfter) : NaN;
      toast.add({
        title: t(`feed.errors.${feedErrorKey(error, options)}`, {
          seconds: Number.isFinite(retryAfter) ? retryAfter : 60,
        }),
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    },
  };
}

/**
 * The clock the posts' ages read. The server's render and the browser's first one share it, so
 * they agree; once the page is mounted it is set to now, then kept current every 30 seconds.
 */
export function useFeedNow() {
  return useState('feed-now', () => Date.now());
}

/** Starts the clock for the page that calls it. */
export function useFeedClock() {
  const now = useFeedNow();
  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => {
    now.value = Date.now();
    timer = setInterval(() => {
      now.value = Date.now();
    }, 30_000);
  });
  onBeforeUnmount(() => {
    clearInterval(timer);
  });
}

/** Whether the person may post, reply and like now: linked, not banned, writing on. */
export function canWriteFeed(me: FeedMe | null | undefined): boolean {
  return Boolean(me?.linked && me.rights.write && me.writing);
}
