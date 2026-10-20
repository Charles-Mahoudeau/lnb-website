import type {
  ShortLinkBody,
  ShortLinkDetail,
  ShortLinkList,
  ShortLinkPatchBody,
  ShortLinkProblem,
} from '#shared/schemas/short-links';
import { SHORT_LINK_PROBLEMS } from '#shared/schemas/short-links';

// The Short links section of the admin area. Writes throw a ShortLinkError with the API's problem.

/** A refused short links request, with the reason the API gave. */
export class ShortLinkError extends Error {
  constructor(readonly problem: ShortLinkProblem | 'failed') {
    super(`Short link request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
    throw new ShortLinkError(
      SHORT_LINK_PROBLEMS.includes(problem as ShortLinkProblem)
        ? (problem as ShortLinkProblem)
        : 'failed',
    );
  }
}

/** Every short link with its clicks. */
export function useAdminShortLinks() {
  return useFetch<ShortLinkList>('/api/admin/short-links', { key: 'short-links-admin' });
}

/** One short link with its statistics. */
export function useAdminShortLink(id: string) {
  return useFetch<ShortLinkDetail>(`/api/admin/short-links/${id}`, {
    key: `short-link-admin-${id}`,
  });
}

/** What admins can do to the short links. Each throws a ShortLinkError when refused. */
export const shortLinkActions = {
  create: (body: ShortLinkBody) =>
    call(() =>
      $fetch<{ id: string; shortId: string }>('/api/admin/short-links', { method: 'POST', body }),
    ),
  update: (id: string, body: ShortLinkPatchBody) =>
    call(() => $fetch(`/api/admin/short-links/${id}`, { method: 'PATCH', body })),
  remove: (id: string) => call(() => $fetch(`/api/admin/short-links/${id}`, { method: 'DELETE' })),
};
