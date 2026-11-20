import type { ChangelogPublicList } from '#shared/schemas/changelog';

// The public changelog (/minecraft/changelog). The admin side is in useChangelogAdmin.

/** The first page of published posts, in the page's language. */
export function usePublicChangelog(limit = 10) {
  const { locale } = useI18n();
  return useFetch<ChangelogPublicList>('/api/changelog/posts', {
    query: computed(() => ({ lang: locale.value, limit })),
    key: `changelog-${String(limit)}`,
  });
}
