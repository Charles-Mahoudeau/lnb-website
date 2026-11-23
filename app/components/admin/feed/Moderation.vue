<script setup lang="ts">
import type { FeedAdminChip, FeedAdminState } from '~/utils/feed-admin';

import type { FeedAdminPost } from '#shared/schemas/feed';
import type { WardenUserOption } from '#shared/schemas/warden';

// The Feed tab of Moderation (docs/feed.md, "Moderation"; mock M1, "table and drawer"): one
// filterable table of posts and replies, live and deleted, with the real authors of anonymous
// ones. The filters, the page and the open row live in the URL, so a view can be linked and the
// back button works. A row opens the drawer.
const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();

// The URL's query, or the one a navigation still on its way will set: two clicks faster than
// the router add up instead of the second starting from the URL the first hasn't changed yet.
const pending = shallowRef<Record<string, string> | null>(null);
const state = computed(() => feedAdminStateFromQuery(pending.value ?? route.query));

/** Moves to another state: a filter replaces the URL and goes back to the first page. */
function go(patch: Partial<FeedAdminState>, options: { push?: boolean } = {}) {
  const query = feedAdminUrlQuery({ ...state.value, ...patch });
  pending.value = query;
  const done = options.push ? router.push({ query }) : router.replace({ query });
  void done.finally(() => {
    if (pending.value === query) pending.value = null;
  });
}

// The search field: typed here, sent after a short pause.
const search = ref(state.value.q);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (value.trim() !== state.value.q.trim()) go({ q: value, cursor: null });
  }, 250);
});
watch(
  () => state.value.q,
  (value) => {
    if (value.trim() !== search.value.trim()) search.value = value;
  },
);
onScopeDispose(() => {
  clearTimeout(timer);
});

// The API query changes only when what it asks changes, not when the drawer opens or closes.
const apiKey = computed(() => JSON.stringify(feedAdminApiQuery(state.value)));
const query = ref(feedAdminApiQuery(state.value));
watch(apiKey, () => {
  query.value = feedAdminApiQuery(state.value);
});

const { data, error, status, refresh } = await useFeedAdminList(query);
const rows = computed(() => data.value?.items ?? []);

const CHIP_LABELS: Record<FeedAdminChip, string> = {
  announcements: 'admin.feed.filters.announcements',
  global: 'admin.feed.filters.global',
  replies: 'admin.feed.filters.replies',
  anonymous: 'admin.feed.filters.anonymous',
  deleted: 'admin.feed.filters.deleted',
};
function toggleChip(chip: FeedAdminChip) {
  const chips = state.value.chips.includes(chip)
    ? state.value.chips.filter((item) => item !== chip)
    : [...state.value.chips, chip];
  go({ chips, cursor: null });
}

// The person filter: "Everyone", or one person picked by name or email.
// Reka's combobox refuses an empty value, so "Everyone" has a word of its own.
const EVERYONE = '__everyone__';
const picked = ref<WardenUserOption | null>(null);
const personSearch = ref('');
const found = ref<WardenUserOption[]>([]);
let personTimer: ReturnType<typeof setTimeout> | undefined;
watch(personSearch, (q) => {
  clearTimeout(personTimer);
  if (q.trim().length < 2) return;
  personTimer = setTimeout(() => {
    feedAdminActions
      .searchPeople(q.trim())
      .then((people) => (found.value = people))
      .catch(() => (found.value = []));
  }, 250);
});
onScopeDispose(() => {
  clearTimeout(personTimer);
});
/** The chosen person's name: picked here, else read from their rows, else a plain label. */
const personName = computed(() => {
  const id = state.value.user;
  if (!id) return null;
  if (picked.value?.userId === id) return picked.value.name;
  const row = rows.value.find((item) => item.authorUserId === id);
  return row ? feedDisplayName(row.author) : t('admin.feed.person.chosen');
});
const personItems = computed(() => {
  const chosen = state.value.user
    ? [{ label: personName.value ?? '', value: state.value.user }]
    : [];
  return [
    { label: t('admin.feed.person.everyone'), value: EVERYONE, icon: 'i-lucide-users' },
    ...chosen,
    ...found.value
      .filter((person) => person.userId !== state.value.user)
      .map((person) => ({ label: person.name, description: person.email, value: person.userId })),
  ];
});
const personValue = computed({
  get: () => state.value.user ?? EVERYONE,
  set: (value: string) => {
    picked.value = found.value.find((person) => person.userId === value) ?? picked.value;
    go({ user: value === EVERYONE ? null : value, cursor: null });
  },
});

const summary = computed(() => {
  const counts = data.value?.summary;
  if (!counts) return null;
  if (state.value.chips.includes('deleted')) {
    return t('admin.feed.summary.deletedOnly', { count: counts.deleted }, counts.deleted);
  }
  return t('admin.feed.summary.line', {
    posts: t('admin.feed.summary.posts', { count: counts.last30Days }, counts.last30Days),
    deleted: t('admin.feed.summary.deleted', { count: counts.deleted }, counts.deleted),
  });
});
const filtered = computed(
  () => state.value.chips.length > 0 || !!state.value.user || state.value.q.trim().length >= 2,
);

function open(row: FeedAdminPost) {
  go({ post: row.id }, { push: true });
}
function next() {
  const cursor = data.value?.nextCursor;
  if (cursor) go({ cursor, post: null }, { push: true });
}
function first() {
  go({ cursor: null, post: null }, { push: true });
}

// The page's clock, started here: the dates (today's as a time) and the drawer's ages move on.
useFeedClock();
const now = useFeedNow();
const date = (iso: string) => formatFeedAdminDate(iso, locale.value, now.value);
const day = (iso: string) => formatFeedAdminDay(iso, locale.value, now.value);

function replyLine(row: FeedAdminPost) {
  if (!row.threadId) return null;
  if (row.replyToGone) return t('admin.feed.replyToGone');
  if (!row.replyTo) return t('admin.feed.replyToPost');
  return row.replyTo.anonymous || !row.replyTo.name
    ? t('admin.feed.replyTo', { name: t('feed.post.anonymous') })
    : t('admin.feed.replyTo', { name: row.replyTo.name });
}

function deletedLine(row: FeedAdminPost) {
  const who = feedAdminDeleter(row);
  if (!row.deletedAt || !who) return null;
  const at = date(row.deletedAt);
  return who.kind === 'moderator'
    ? t('admin.feed.state.by', { name: who.name, date: at })
    : t(`admin.feed.state.${who.kind}`, { date: at });
}

async function onDeleted() {
  await refresh();
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-3">
      <UInput
        v-model="search"
        type="search"
        icon="i-lucide-search"
        size="md"
        :placeholder="t('admin.feed.search')"
        :aria-label="t('admin.feed.search')"
        class="min-w-0 flex-1 basis-64 sm:max-w-sm"
      />
      <div class="flex flex-wrap gap-2" role="group" :aria-label="t('admin.feed.filters.label')">
        <UButton
          v-for="chip in FEED_ADMIN_CHIPS"
          :key="chip"
          size="md"
          :color="state.chips.includes(chip) ? 'secondary' : 'neutral'"
          :variant="state.chips.includes(chip) ? 'soft' : 'outline'"
          :icon="state.chips.includes(chip) ? 'i-lucide-check' : undefined"
          :aria-pressed="state.chips.includes(chip)"
          :label="t(CHIP_LABELS[chip])"
          @click="toggleChip(chip)"
        />
      </div>
      <USelectMenu
        v-model="personValue"
        v-model:search-term="personSearch"
        :items="personItems"
        value-key="value"
        ignore-filter
        size="md"
        :icon="state.user ? 'i-lucide-user-round' : 'i-lucide-users'"
        :placeholder="t('admin.feed.person.everyone')"
        :search-input="{ placeholder: t('admin.feed.person.search') }"
        :aria-label="t('admin.feed.person.label')"
        class="w-56"
      />
    </div>

    <p v-if="summary" class="text-sm text-muted tabular-nums" aria-live="polite">{{ summary }}</p>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.feed.loadFailed')"
    />

    <section
      v-else-if="!rows.length && status !== 'pending'"
      class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-6 py-12 text-center"
    >
      <IconTile icon="i-lucide-messages-square" />
      <h2 class="text-lg font-semibold text-highlighted">
        {{ t(filtered ? 'admin.feed.empty.filteredTitle' : 'admin.feed.empty.title') }}
      </h2>
      <p class="max-w-prose text-muted">
        {{ t(filtered ? 'admin.feed.empty.filteredText' : 'admin.feed.empty.text') }}
      </p>
      <UButton
        v-if="filtered"
        color="neutral"
        variant="soft"
        size="md"
        :label="t('admin.feed.empty.clear')"
        @click="router.replace({ query: {} })"
      />
    </section>

    <div v-else class="overflow-hidden rounded-lg bg-elevated">
      <div class="overflow-x-auto">
        <table class="w-full min-w-4xl border-collapse text-left" :aria-busy="status === 'pending'">
          <thead class="text-sm text-muted">
            <tr>
              <th class="px-4 py-3 font-medium">{{ t('admin.feed.columns.author') }}</th>
              <th class="px-4 py-3 font-medium">{{ t('admin.feed.columns.post') }}</th>
              <th class="px-4 py-3 font-medium">{{ t('admin.feed.columns.feed') }}</th>
              <th class="px-4 py-3 font-medium">{{ t('admin.feed.columns.reactions') }}</th>
              <th class="px-4 py-3 font-medium">{{ t('admin.feed.columns.date') }}</th>
              <th class="px-4 py-3 font-medium">{{ t('admin.feed.columns.state') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.id"
              :class="[
                'cursor-pointer border-t border-default align-top',
                row.id === state.post ? 'bg-secondary/10' : 'hover:bg-accented',
              ]"
              @click="open(row)"
            >
              <td :class="['w-56 px-4 py-3', { 'opacity-60': row.deletedAt }]">
                <div class="flex items-start gap-3">
                  <FeedAnonymousAvatar v-if="row.anonymous" size="sm" />
                  <WardenMinecraftHead v-else :uuid="row.author.uuid" size="sm" />
                  <div class="flex min-w-0 flex-col text-sm">
                    <template v-if="row.anonymous">
                      <span class="font-semibold text-muted">{{ t('feed.post.anonymous') }}</span>
                      <span class="flex min-w-0 items-start gap-1 text-muted">
                        <UIcon
                          name="i-lucide-lock"
                          class="mt-0.5 size-3.5 shrink-0"
                          :aria-label="t('admin.feed.realAuthor')"
                        />
                        <span class="min-w-0 break-words">
                          {{ feedDisplayName(row.author) }}
                          <template v-if="feedHandle(row.author)">
                            {{ feedHandle(row.author) }}
                          </template>
                        </span>
                      </span>
                    </template>
                    <template v-else>
                      <span class="font-semibold break-words text-highlighted">
                        {{ feedDisplayName(row.author) }}
                      </span>
                      <span class="break-words text-muted">
                        {{ feedHandle(row.author) ?? t('admin.feed.nameHidden') }}
                      </span>
                    </template>
                  </div>
                </div>
              </td>
              <td :class="['max-w-md px-4 py-3', { 'opacity-60': row.deletedAt }]">
                <button
                  type="button"
                  :aria-current="row.id === state.post ? 'true' : undefined"
                  :class="[
                    'line-clamp-2 text-left wrap-anywhere hover:underline',
                    row.deletedAt ? 'text-muted' : 'text-default',
                  ]"
                  @click.stop="open(row)"
                >
                  {{ row.text }}
                </button>
                <span v-if="replyLine(row)" class="mt-1 flex items-center gap-1 text-sm text-muted">
                  <UIcon name="i-lucide-corner-down-right" class="size-3.5 shrink-0" />
                  {{ replyLine(row) }}
                </span>
              </td>
              <td :class="['px-4 py-3', { 'opacity-60': row.deletedAt }]">
                <UBadge
                  color="neutral"
                  variant="outline"
                  size="md"
                  :label="t(`admin.feed.feeds.${row.feed}`)"
                />
                <span
                  v-if="row.pinnedAt"
                  class="mt-1 flex items-center gap-1 text-sm whitespace-nowrap text-muted"
                >
                  <UIcon name="i-lucide-pin" class="size-3.5" />
                  {{ t('admin.feed.pinned') }}
                </span>
              </td>
              <td
                :class="[
                  'px-4 py-3 text-sm whitespace-nowrap text-muted tabular-nums',
                  { 'opacity-60': row.deletedAt },
                ]"
              >
                <span class="inline-flex items-center gap-3">
                  <span
                    class="inline-flex items-center gap-1"
                    :aria-label="t('admin.feed.likes', { count: row.likes }, row.likes)"
                  >
                    <UIcon name="i-lucide-heart" class="size-4" />{{ row.likes }}
                  </span>
                  <span
                    class="inline-flex items-center gap-1"
                    :aria-label="t('admin.feed.replies', { count: row.replies }, row.replies)"
                  >
                    <UIcon name="i-lucide-message-circle" class="size-4" />{{ row.replies }}
                  </span>
                </span>
              </td>
              <td
                :class="[
                  'px-4 py-3 text-sm whitespace-nowrap text-muted tabular-nums',
                  { 'opacity-60': row.deletedAt },
                ]"
              >
                <time :datetime="row.createdAt" :title="formatFeedDate(row.createdAt, locale)">
                  {{ date(row.createdAt) }}
                </time>
              </td>
              <td class="w-48 px-4 py-3">
                <div v-if="row.deletedAt" class="flex flex-col items-start gap-1 text-sm">
                  <UBadge
                    color="neutral"
                    variant="subtle"
                    size="md"
                    :label="t('admin.feed.state.deleted')"
                  />
                  <span class="text-muted tabular-nums">{{ deletedLine(row) }}</span>
                  <span v-if="row.purgeAt" class="text-muted tabular-nums">
                    {{ t('admin.feed.state.purge', { date: day(row.purgeAt) }) }}
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        v-if="state.cursor || data?.nextCursor"
        class="flex items-center justify-end gap-2 border-t border-default px-4 py-2"
      >
        <UButton
          v-if="state.cursor"
          color="neutral"
          variant="ghost"
          size="md"
          :label="t('admin.feed.first')"
          @click="first"
        />
        <UButton
          v-if="data?.nextCursor"
          color="neutral"
          variant="ghost"
          size="md"
          :label="t('admin.feed.next')"
          @click="next"
        />
      </div>
    </div>

    <AdminFeedDrawer @deleted="onDeleted" />
  </div>
</template>
