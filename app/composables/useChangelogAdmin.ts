import { CHANGELOG_PROBLEMS } from '#shared/schemas/changelog';
import type {
  ChangelogCreateBody,
  ChangelogDetail,
  ChangelogList,
  ChangelogPatchBody,
  ChangelogProblem,
} from '#shared/schemas/changelog';

// The Changelog section of the admin area. Writes throw a ChangelogError with the API's problem.

/** A refused changelog request, with the reason the API gave. */
export class ChangelogError extends Error {
  constructor(readonly problem: ChangelogProblem | 'failed') {
    super(`Changelog request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
    throw new ChangelogError(
      CHANGELOG_PROBLEMS.includes(problem as ChangelogProblem)
        ? (problem as ChangelogProblem)
        : 'failed',
    );
  }
}

const base = '/api/admin/changelog';
const post = <T>(path: string, body?: object) =>
  call(() => $fetch(`${base}${path}`, { method: 'POST', body }) as Promise<T>);

/** Every post, for the list. */
export function useAdminChangelog() {
  return useFetch<ChangelogList>(base, { key: 'changelog-admin' });
}

/** One post, with both languages. */
export function useAdminChangelogPost(id: string) {
  return useFetch<ChangelogDetail>(`${base}/${id}`, { key: `changelog-admin-${id}` });
}

/** Whether DeepL is set up, so the Translate button can work. */
export function useChangelogTranslation() {
  return useFetch<{ available: boolean }>(`${base}/translation`, { key: 'changelog-translation' });
}

/** What admins can do to a post. Each throws a ChangelogError when refused. */
export const changelogActions = {
  create: (body: ChangelogCreateBody) => post<ChangelogDetail>('', body),
  update: (id: string, body: ChangelogPatchBody) =>
    call(() => $fetch<ChangelogDetail>(`${base}/${id}`, { method: 'PATCH', body })),
  translate: (id: string) => post<ChangelogDetail>(`/${id}/translate`),
  publish: (id: string) => post<ChangelogDetail>(`/${id}/publish`),
  schedule: (id: string, at: string) => post<ChangelogDetail>(`/${id}/schedule`, { at }),
  unpublish: (id: string) => post<ChangelogDetail>(`/${id}/unpublish`),
  preview: (markdown: string) => post<{ html: string }>('/preview', { markdown }),
};
