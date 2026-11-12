<script setup lang="ts">
import { AdminAnticheatDrawer, AdminAnticheatProjectDialog } from '#components';

import type {
  AnticheatFileRow,
  AnticheatProjectKind,
  AnticheatStatus,
} from '#shared/schemas/anticheat';
import { ANTICHEAT_PROJECT_KINDS, ANTICHEAT_STATUSES } from '#shared/schemas/anticheat';

// The file registry as a table on one raised section: a project (with its versions) or a file
// without a project per row. A row opens the drawer. With `queue`, it is the review queue:
// every kind, sorted by who is waiting, and only the review and refused statuses.
const props = defineProps<{ queue?: boolean }>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const overlay = useOverlay();

const STATUSES: readonly AnticheatStatus[] = props.queue
  ? ['review', 'refused']
  : ANTICHEAT_STATUSES;

const kind = computed<AnticheatProjectKind>(() => {
  const value = String(route.query.kind ?? '');
  return (ANTICHEAT_PROJECT_KINDS as readonly string[]).includes(value)
    ? (value as AnticheatProjectKind)
    : 'mod';
});
function setKind(value: string | number) {
  void router.replace({ query: { ...route.query, kind: String(value) } });
}

const search = ref('');
const status = ref<AnticheatStatus | null>(props.queue ? 'review' : null);
function build() {
  return {
    kind: props.queue ? undefined : kind.value,
    status: status.value ?? undefined,
    q: search.value.trim() || undefined,
    sort: props.queue ? ('queue' as const) : ('recent' as const),
  };
}
const query = ref(build());
let timer: ReturnType<typeof setTimeout> | undefined;
watch([search, status, kind], () => {
  clearTimeout(timer);
  timer = setTimeout(() => (query.value = build()), 250);
});
onScopeDispose(() => {
  clearTimeout(timer);
});

const { data, error, status: fetchStatus, refresh } = await useAnticheatFiles(query);

const more = ref<AnticheatFileRow[]>([]);
const moreCursor = ref<string | null | undefined>(undefined);
const loadingMore = ref(false);
watch(data, () => {
  more.value = [];
  moreCursor.value = undefined;
});
const rows = computed(() => [...(data.value?.items ?? []), ...more.value]);
const nextCursor = computed(() =>
  moreCursor.value === undefined ? (data.value?.nextCursor ?? null) : moreCursor.value,
);

async function loadMore() {
  if (!nextCursor.value) return;
  loadingMore.value = true;
  try {
    const page = await anticheatActions.moreFiles(query.value, nextCursor.value);
    more.value.push(...page.items);
    moreCursor.value = page.nextCursor;
  } finally {
    loadingMore.value = false;
  }
}

function toggleStatus(value: AnticheatStatus) {
  status.value = status.value === value ? (props.queue ? 'review' : null) : value;
}

const tabs = computed(() =>
  ANTICHEAT_PROJECT_KINDS.map((value) => ({
    label: t(`admin.anticheat.tabs.${value}`),
    value,
  })),
);

async function open(row: AnticheatFileRow) {
  const drawer = overlay.create(AdminAnticheatDrawer, { props: { row } });
  if (await drawer.open().result) {
    await refresh();
    await refreshNuxtData('anticheat-summary');
  }
}

async function decide(decision: 'approved' | 'banned') {
  const dialog = overlay.create(AdminAnticheatProjectDialog, {
    props: { decision, kind: kind.value },
  });
  if (await dialog.open().result) {
    await refresh();
    await refreshNuxtData('anticheat-summary');
  }
}

function secondLine(row: AnticheatFileRow) {
  return row.fileCount > 1 || row.projectId
    ? t('admin.anticheat.versions', row.fileCount)
    : t(`admin.anticheat.kinds.${row.kind}`);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="!queue" class="flex flex-wrap items-center justify-between gap-3">
      <UTabs
        :model-value="kind"
        :items="tabs"
        variant="pill"
        :content="false"
        @update:model-value="setKind"
      />
      <div class="flex flex-wrap gap-2">
        <UButton
          size="md"
          :label="t('admin.anticheat.approveProject')"
          icon="i-lucide-plus"
          @click="decide('approved')"
        />
        <UButton
          size="md"
          color="neutral"
          variant="soft"
          :label="t('admin.anticheat.banProject')"
          @click="decide('banned')"
        />
      </div>
    </div>

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <div class="flex flex-wrap items-center gap-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          size="md"
          class="w-full max-w-xs"
          :placeholder="t('admin.anticheat.search')"
          :aria-label="t('admin.anticheat.search')"
        />
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="value in STATUSES"
            :key="value"
            size="md"
            color="secondary"
            :variant="status === value ? 'soft' : 'outline'"
            :aria-pressed="status === value"
            :label="t(`admin.anticheat.status.${value}`)"
            @click="toggleStatus(value)"
          />
        </div>
      </div>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="t('admin.anticheat.errors.failed')"
      />
      <p v-else-if="!rows.length && fetchStatus !== 'pending'" class="text-muted">
        {{ t(queue ? 'admin.anticheat.emptyQueue' : 'admin.anticheat.empty') }}
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-3xl border-collapse text-left">
          <thead class="text-sm text-muted">
            <tr>
              <th class="px-3 py-2 font-medium">{{ t('admin.anticheat.columns.file') }}</th>
              <th class="px-3 py-2 font-medium">{{ t('admin.anticheat.columns.status') }}</th>
              <th class="px-3 py-2 text-right font-medium">
                {{ t('admin.anticheat.columns.score') }}
              </th>
              <th class="px-3 py-2 text-right font-medium">
                {{ t('admin.anticheat.columns.usingNow') }}
              </th>
              <th class="px-3 py-2 text-right font-medium">
                {{ t('admin.anticheat.columns.everUsed') }}
              </th>
              <th class="px-3 py-2 text-right font-medium">
                {{ t('admin.anticheat.columns.waiting') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.projectId ?? row.sha512 ?? row.name"
              class="cursor-pointer border-t border-default hover:bg-accented"
              @click="open(row)"
            >
              <td class="max-w-sm px-3 py-3">
                <button
                  type="button"
                  class="block max-w-full truncate text-left font-semibold text-highlighted hover:underline"
                  @click.stop="open(row)"
                >
                  {{ row.name }}
                </button>
                <span class="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted">
                  <UBadge
                    v-for="platform in row.platforms"
                    :key="platform"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    :label="t(`admin.anticheat.platforms.${platform}`)"
                  />
                  {{ secondLine(row) }}
                </span>
              </td>
              <td class="px-3 py-3"><AdminAnticheatStatusBadge :status="row.status" /></td>
              <td class="px-3 py-3 text-right font-display tabular-nums">
                {{ row.score ?? '–' }}
              </td>
              <td class="px-3 py-3 text-right tabular-nums">{{ row.usingNow }}</td>
              <td class="px-3 py-3 text-right tabular-nums">{{ row.everUsed }}</td>
              <td
                class="px-3 py-3 text-right tabular-nums"
                :class="{ 'font-semibold text-warning': row.waiting > 0 }"
              >
                {{ row.waiting }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <UButton
        v-if="nextCursor"
        color="neutral"
        variant="soft"
        size="md"
        class="self-start"
        :loading="loadingMore"
        :label="t('admin.anticheat.more')"
        @click="loadMore"
      />
    </section>
  </div>
</template>
