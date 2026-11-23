import type { FeedAdminApiQuery } from '../utils/feed-admin';

import type {
  FeedAdminDetail,
  FeedAdminList,
  FeedAnnouncerState,
  FeedProblem,
} from '#shared/schemas/feed';
import { FEED_PROBLEMS } from '#shared/schemas/feed';
import type { WardenUserOption } from '#shared/schemas/warden';

// The admin's side of Feed (docs/feed.md, "For the admin" and "Moderation"): the Feed tab of
// Moderation and the announcer switch of the Person page. Reads use useFetch with explicit keys;
// writes throw a FeedError with the API's problem, and the component shows the toast.

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const raw = (error as { data?: { data?: unknown } } | null)?.data?.data;
    const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
    const problem = FEED_PROBLEMS.includes(data?.problem as FeedProblem)
      ? (data?.problem as FeedProblem)
      : 'failed';
    throw new FeedError(problem, { ...data });
  }
}

/** The Feed table: one page of rows matching the filters, and the filters' summary. */
export function useFeedAdminList(query: Ref<FeedAdminApiQuery>) {
  return useFetch<FeedAdminList>('/api/feed/admin/posts', { key: 'feed-admin-posts', query });
}

/** One row and its thread, for the drawer; nothing while no row is open. */
export function useFeedAdminRow(id: Ref<string | null>) {
  // Forwards the session on the server render, as useFetch does.
  const request = useRequestFetch();
  return useAsyncData<FeedAdminDetail | null>(
    () => `feed-admin-post-${id.value ?? 'none'}`,
    () =>
      id.value
        ? request<FeedAdminDetail>(`/api/feed/admin/posts/${encodeURIComponent(id.value)}`)
        : Promise.resolve(null),
  );
}

/** Whether a person is an announcer, for the Person page's switch and header pill. */
export function useFeedAnnouncer(userId: string) {
  return useFetch<FeedAnnouncerState>(`/api/feed/admin/announcers/${encodeURIComponent(userId)}`, {
    key: `feed-announcer-${userId}`,
  });
}

export const feedAdminActions = {
  /** People for the person filter, by name or email (the route the other admin pickers use). */
  searchPeople: (q: string) =>
    call(() => $fetch<WardenUserOption[]>('/api/warden/admin/users', { query: { q } })),
  /** Deletes as a moderator; an empty reason is none. */
  remove: (id: string, reason: string) =>
    call(() =>
      $fetch(`/api/feed/admin/posts/${encodeURIComponent(id)}/delete`, {
        method: 'POST',
        body: reason.trim() ? { reason: reason.trim() } : {},
      }),
    ),
  setAnnouncer: (userId: string, announcer: boolean) =>
    call(() =>
      $fetch<FeedAnnouncerState>(`/api/feed/admin/announcers/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        body: { announcer },
      }),
    ),
};
