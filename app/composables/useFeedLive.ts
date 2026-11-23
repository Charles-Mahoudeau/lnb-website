import type {
  FeedMe,
  FeedName,
  FeedPage,
  FeedPostView,
  FeedThread,
  FeedViewsOf,
} from '#shared/schemas/feed';

// The Feed page's live updates (docs/feed.md, "Live updates in the browser"): one stream per
// tab, opened on /minecraft/feed and /minecraft/feed/:id only, in the browser only. New posts
// come as IDs; the page asks GET /api/feed/views for its own view of them, a second's worth at a
// time. A 503, 429 or 401 stops the stream for good and the page works as without it (reload to
// see newer posts); a dropped connection comes back after 1 to 30 seconds with Last-Event-ID.

/** A tab hidden this long drops its stream, and takes it again with Last-Event-ID when shown. */
const HIDDEN_CLOSE_MS = 60_000;
/** The `post` events of this long go into one GET /views. */
const GATHER_MS = 1000;
/** Seen marks sent for live posts, at most this often. */
const SEEN_EVERY_MS = 2000;
/** The room a new post needs to count as visible where it would go. */
const POST_ROOM_PX = 96;
/** The answers that mean "no live updates for this page": signed out, too many tabs, off. */
const GIVE_UP = new Set([401, 403, 429, 503]);

type Timeline = Awaited<ReturnType<typeof useFeedTimeline>>;
type Thread = Awaited<ReturnType<typeof useFeedThread>>;

interface PostEvent {
  id: string;
  feed: FeedName;
  threadId: string | null;
  createdAt: string;
}
type Item = { id: string; feed: FeedName; threadId: string | null };
type Counts = { id: string; likes: number; replies: number };
type Pin = { id: string; pinnedAt: string };

export interface FeedLiveHandlers {
  post: (data: PostEvent) => void;
  deleted: (items: Item[]) => void;
  counts: (items: Counts[]) => void;
  pins: (group: Pin[]) => void;
  reset: () => void;
}

export type FeedStreamState = 'idle' | 'open' | 'retrying' | 'off';

/** A list of objects, or nothing: what a malformed message gives is skipped. */
function objects<T>(value: unknown): T[] {
  return Array.isArray(value)
    ? (value.filter((item) => typeof item === 'object' && item !== null) as T[])
    : [];
}

/**
 * Hands one message of the stream to its handler. Anything malformed or unknown is skipped, and
 * a handler that fails on it doesn't break the stream.
 */
function dispatch(handlers: FeedLiveHandlers, message: FeedLiveMessage) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message.data);
  } catch {
    return;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;
  const data = parsed as Record<string, unknown>;
  try {
    if (message.event === 'post') {
      if (typeof data.id === 'string') handlers.post(data as unknown as PostEvent);
    } else if (message.event === 'deleted') handlers.deleted(objects<Item>(data.items));
    else if (message.event === 'counts') handlers.counts(objects<Counts>(data.items));
    else if (message.event === 'pins') handlers.pins(objects<Pin>(data.pinned));
    else if (message.event === 'reset') handlers.reset();
  } catch (error) {
    console.error('A Feed live event could not be applied', error);
  }
}

/**
 * The page's one stream of live events, read with fetch rather than EventSource: EventSource
 * can't tell a 503 or a 429 (stop) from a proxy's 502 (try again), and only resends Last-Event-ID
 * on reconnections it makes itself, without a backoff. The wire format is the same.
 */
export function useFeedStream(handlers: FeedLiveHandlers) {
  const state = ref<FeedStreamState>('idle');
  if (import.meta.server) return { state };

  const { user } = useAuth();
  const { isEnabled } = useFlags();
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let lastId: string | null = null;
  let stopped = false;

  async function connect() {
    if (stopped || controller) return;
    clearTimeout(retryTimer);
    retryTimer = undefined;
    const current = new AbortController();
    controller = current;
    try {
      const response = await fetch('/api/feed/events', {
        headers: { accept: 'text/event-stream', ...(lastId ? { 'last-event-id': lastId } : {}) },
        cache: 'no-store',
        credentials: 'same-origin',
        signal: current.signal,
      });
      if (GIVE_UP.has(response.status)) {
        stop();
        return;
      }
      if (!response.ok || !response.body)
        throw new Error(`stream answered ${String(response.status)}`);
      state.value = 'open';
      const reader = createFeedSseReader((message) => {
        attempt = 0;
        if (message.id) lastId = message.id;
        dispatch(handlers, message);
      });
      const decoder = new TextDecoder();
      const body = response.body.getReader();
      for (;;) {
        const { done, value } = await body.read();
        if (done) break;
        reader.push(decoder.decode(value, { stream: true }));
      }
    } catch {
      // Dropped, refused by a proxy, or aborted: decided below.
    }
    // Closed on purpose (hidden, stopped, left): close() already let go of it.
    if (controller !== current) return;
    // Whatever ended the reading, the connection goes before another one opens.
    current.abort();
    controller = null;
    state.value = 'retrying';
    retryTimer = setTimeout(() => void connect(), feedLiveRetryDelay(attempt++));
  }

  /** Closes the connection; `connect` opens it again. */
  function close() {
    controller?.abort();
    controller = null;
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  /** No live updates for this page any more: the page works as it loaded. */
  function stop() {
    stopped = true;
    close();
    clearTimeout(hiddenTimer);
    state.value = 'off';
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      clearTimeout(hiddenTimer);
      hiddenTimer = setTimeout(close, HIDDEN_CLOSE_MS);
      return;
    }
    clearTimeout(hiddenTimer);
    if (!stopped && !controller && !retryTimer) void connect();
  }

  onMounted(() => {
    if (!isEnabled('feed.live') || !user.value) {
      stop();
      return;
    }
    document.addEventListener('visibilitychange', onVisibility);
    // A tab opened in the background takes its stream when it is first shown.
    if (document.visibilityState === 'visible') void connect();
  });
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    stop();
  });
  watch(user, (signedIn) => {
    if (!signedIn) stop();
  });

  return { state };
}

/**
 * Gathers the IDs the stream announced for a second, then asks the site for the reader's own
 * views of them, 20 at a time. A failed read is dropped: the page then misses that post until a
 * reload, as it would without live updates.
 */
function useFeedViewBatch(onViews: (posts: FeedPostView[]) => void) {
  const wanted = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let left = false;
  // A function, so that a check after an await isn't narrowed away by the one before it.
  const isLeft = () => left;

  async function flush() {
    timer = undefined;
    const ids = [...wanted];
    wanted.clear();
    for (let start = 0; start < ids.length; start += 20) {
      // The page was left: nobody reads the rest.
      if (isLeft()) return;
      try {
        const { posts } = await $fetch<FeedViewsOf>('/api/feed/views', {
          query: { ids: ids.slice(start, start + 20).join(',') },
        });
        if (!isLeft()) onViews(posts);
      } catch {
        // Missed: shown at the next reload.
      }
    }
  }

  onBeforeUnmount(() => {
    left = true;
    clearTimeout(timer);
  });

  return {
    want(id: string) {
      wanted.add(id);
      timer ??= setTimeout(() => void flush(), GATHER_MS);
    },
  };
}

/** Runs `work` at most once every `ms`, the last call waiting for its turn. */
function useThrottled(work: () => void, ms: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  onBeforeUnmount(() => {
    clearTimeout(timer);
  });
  return () => {
    const wait = last + ms - Date.now();
    if (wait <= 0) {
      last = Date.now();
      work();
      return;
    }
    timer ??= setTimeout(() => {
      timer = undefined;
      last = Date.now();
      work();
    }, wait);
  };
}

/** Where the bottom of the site's sticky header is, the top of what the reader sees. */
function visibleTop(): number {
  return Math.max(0, document.querySelector('header')?.getBoundingClientRect().bottom ?? 0);
}

/**
 * The live updates of the Feed page (`/minecraft/feed`): new posts at the top when the reader is
 * there, otherwise behind the "N new posts" button; the other tab's dot; the replies that raise a
 * marker on the reader's own posts; deletions, counts and pins in place.
 */
export function useFeedTimelineLive(input: {
  feed: Ref<FeedName>;
  timeline: Timeline;
  me: Ref<FeedMe | null | undefined>;
  /** The list the posts are rows of. */
  list: Readonly<Ref<HTMLElement | null | undefined>>;
}) {
  const { feed, timeline, me } = input;
  /** New posts of the feed shown, newest first, until the reader lets them in. */
  const waiting = ref<FeedPostView[]>([]);
  /** Set when a `reset` found more than a page of new posts: the list restarts from them. */
  let gap: string | null = null;
  /** Whether the place the new posts go is above what the reader sees (the button's arrow). */
  const waitingAbove = ref(false);

  const held = (id: string) =>
    timeline.pinned.value.some((post) => post.id === id) ||
    timeline.posts.value.some((post) => post.id === id);
  const find = (id: string) =>
    timeline.pinned.value.find((post) => post.id === id) ??
    timeline.posts.value.find((post) => post.id === id);
  /** The waiting posts, without any the page got meanwhile (its own post, from the composer). */
  const pending = computed(() => waiting.value.filter((post) => !held(post.id)));

  watch(feed, () => {
    waiting.value = [];
    gap = null;
  });

  const markSeen = useThrottled(() => {
    const upTo = newestFeedCreatedAt({
      pinned: timeline.pinned.value,
      posts: timeline.posts.value,
    });
    if (upTo) feedActions.markFeedSeen(feed.value, upTo).catch(() => {});
  }, SEEN_EVERY_MS);

  /** The row the next new post would take, or where the list ends when it has none. */
  function insertionTop(): number | null {
    const list = input.list.value;
    if (!list) return null;
    const rows = list.querySelectorAll(':scope > article');
    const row = rows[timeline.pinned.value.length];
    return row ? row.getBoundingClientRect().top : list.getBoundingClientRect().bottom;
  }

  /** Where the new posts would go: in view (with room for one), above, or below. */
  function place(): 'visible' | 'above' | 'below' {
    const top = insertionTop();
    if (top === null) return 'visible';
    if (top < visibleTop()) return 'above';
    if (top + POST_ROOM_PX > window.innerHeight) return 'below';
    return 'visible';
  }

  function prependAll(posts: FeedPostView[]) {
    for (const post of [...posts].sort(feedByNewest).reverse()) timeline.prepend(post);
  }

  function arrive(posts: FeedPostView[], forceWait = false) {
    const known = new Set(waiting.value.map((post) => post.id));
    const fresh = posts.filter((post) => !held(post.id) && !known.has(post.id));
    if (!fresh.length) return;
    if (!forceWait && !pending.value.length && place() === 'visible') {
      prependAll(fresh);
      markSeen();
      return;
    }
    waiting.value = [...fresh, ...waiting.value].sort(feedByNewest);
    waitingAbove.value = place() === 'above';
  }

  /** Lets the waiting posts in, and with `scroll` brings the first of them into view. */
  function showWaiting(scroll = true) {
    const posts = pending.value;
    waiting.value = [];
    if (gap !== null) {
      timeline.posts.value = [...posts].sort(feedByNewest);
      timeline.next.value = gap;
      gap = null;
    } else {
      prependAll(posts);
    }
    markSeen();
    if (!scroll) return;
    void nextTick(() => {
      const top = insertionTop();
      if (top === null) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({
        top: window.scrollY + top - visibleTop() - 16,
        behavior: reduce ? 'auto' : 'smooth',
      });
    });
  }

  // Scrolling by hand to where the new posts go lets them in, as the button does.
  let frame = 0;
  function onScroll() {
    if (frame || !pending.value.length) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!pending.value.length) return;
      const where = place();
      if (where === 'visible') showWaiting(false);
      else waitingAbove.value = where === 'above';
    });
  }
  onMounted(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
  });
  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll);
    cancelAnimationFrame(frame);
  });

  const views = useFeedViewBatch((posts) => {
    const mains = posts.filter((post) => post.threadId === null);
    arrive(mains.filter((post) => post.feed === feed.value));
    for (const post of mains) {
      if (post.feed !== feed.value && !post.mine && me.value && !me.value.unread[post.feed]) {
        me.value = { ...me.value, unread: { ...me.value.unread, [post.feed]: true } };
      }
    }
    // A reply to the reader, in the thread of a post of theirs on the page: its marker goes up.
    for (const reply of posts) {
      if (!reply.threadId || !reply.answersMe || reply.mine) continue;
      const main = find(reply.threadId);
      if (main?.mine) timeline.update(main.id, { unseenReplies: main.unseenReplies + 1 });
    }
  });

  async function reload() {
    const shown = feed.value;
    try {
      const fresh = await $fetch<FeedPage>('/api/feed/posts', { query: { feed: shown } });
      if (feed.value !== shown) return;
      const merged = mergeFeedFirstPage(
        { pinned: timeline.pinned.value, posts: timeline.posts.value, next: timeline.next.value },
        fresh,
      );
      timeline.pinned.value = merged.pinned;
      timeline.posts.value = merged.posts;
      timeline.next.value = merged.next;
      waiting.value = waiting.value.filter((post) =>
        merged.newer.some((newer) => newer.id === post.id),
      );
      gap = merged.gap;
      arrive(merged.newer, merged.gap !== null);
    } catch {
      // The page keeps what it shows; a reload reads it again.
    }
  }

  const stream = useFeedStream({
    post(data) {
      if (data.threadId === null) {
        if (data.feed === feed.value) {
          if (!held(data.id)) views.want(data.id);
        } else if (me.value && !me.value.unread[data.feed]) {
          views.want(data.id);
        }
        return;
      }
      if (find(data.threadId)?.mine) views.want(data.id);
    },
    deleted(items) {
      const gone = new Set(items.map((item) => item.id));
      for (const id of gone) timeline.remove(id);
      waiting.value = waiting.value.filter((post) => !gone.has(post.id));
    },
    counts(items) {
      for (const { id, likes, replies } of items) {
        timeline.update(id, { likes, replies });
        waiting.value = waiting.value.map((post) =>
          post.id === id ? { ...post, likes, replies } : post,
        );
      }
    },
    pins(group) {
      if (feed.value === 'announcements') timeline.setPins(group).catch(() => {});
    },
    reset() {
      void reload();
    },
  });

  return {
    state: stream.state,
    waitingCount: computed(() => pending.value.length),
    waitingAbove,
    showWaiting,
  };
}

/**
 * The live updates of a thread's page (`/minecraft/feed/:id`): its new replies at the end, its
 * deletions (the main post's shows the deleted state), counts and pin in place.
 */
export function useFeedThreadLive(input: { id: string; thread: Thread }) {
  const { id, thread } = input;
  const held = (postId: string) =>
    thread.post.value?.id === postId || thread.replies.value.some((reply) => reply.id === postId);

  // The thread is on screen: a reply to the reader raises no marker, it is seen at once.
  const markSeen = useThrottled(() => {
    feedActions.markThreadSeen(id).catch(() => {});
  }, SEEN_EVERY_MS);

  const views = useFeedViewBatch((posts) => {
    let answered = false;
    for (const reply of posts) {
      if (reply.threadId !== id || !thread.post.value) continue;
      thread.appendLive(reply);
      if (reply.answersMe && !reply.mine) answered = true;
    }
    if (answered) markSeen();
  });

  async function reload() {
    try {
      const fresh = await $fetch<FeedThread>(`/api/feed/posts/${id}`);
      thread.merge(fresh);
    } catch (error) {
      if ((error as { statusCode?: number } | null)?.statusCode === 404) thread.markGone();
    }
  }

  const stream = useFeedStream({
    post(data) {
      if (data.threadId === id && !held(data.id)) views.want(data.id);
    },
    deleted(items) {
      for (const item of items) {
        if (item.id === id) thread.markGone();
        else thread.dropReply(item.id);
      }
    },
    counts(items) {
      for (const { id: postId, likes, replies } of items) thread.update(postId, { likes, replies });
    },
    pins(group) {
      const main = thread.post.value;
      if (!main || main.feed !== 'announcements') return;
      const pinnedAt = group.find((pin) => pin.id === main.id)?.pinnedAt ?? null;
      if (pinnedAt !== main.pinnedAt) thread.update(main.id, { pinnedAt });
    },
    reset() {
      void reload();
    },
  });

  return { state: stream.state };
}
