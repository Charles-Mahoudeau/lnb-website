<script setup lang="ts">
import type { AdminActivityEntry, AdminActivityPage } from '#shared/schemas/admin';

// Settings > Activity (docs/activity-log.md): everything the team did on the site, newest first,
// cut by the server to what the role may read. The Person page's "See this person's activity"
// opens it with ?user=<id>.
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { user: me } = useAuth();

const userId = computed(() => (route.query.user ? String(route.query.user) : undefined));
function showEveryone() {
  const { user: _user, ...rest } = route.query;
  void router.replace({ query: rest });
}

const search = ref('');
const query = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => (query.value = value.trim()), 300);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
});

const chosen = ref<AuditArea[]>([]);
const from = ref('');
const to = ref('');
const areaChips = computed(() => activityAreas(me.value?.role));
function toggle(area: AuditArea) {
  chosen.value = chosen.value.includes(area)
    ? chosen.value.filter((entry) => entry !== area)
    : [...chosen.value, area];
}

// A day from the date inputs, as the start of that day in the browser's time zone.
const startOf = (day: string) => new Date(`${day}T00:00:00`).toISOString();
const nextDay = (day: string) =>
  new Date(new Date(`${day}T00:00:00`).getTime() + 86_400_000).toISOString();
const filters = computed(() => ({
  q: query.value || undefined,
  areas: chosen.value.join(',') || undefined,
  // A person's whole history, not only the last 30 days.
  from: from.value ? startOf(from.value) : userId.value ? '2000-01-01T00:00:00Z' : undefined,
  to: to.value ? nextDay(to.value) : undefined,
  user: userId.value,
}));

const { data, pending, error } = await useFetch<AdminActivityPage>('/api/admin/activity', {
  key: 'admin-activity',
  query: filters,
});

const older = ref<AdminActivityEntry[]>([]);
const olderCursor = ref<string | null | undefined>(undefined);
const loadingMore = ref(false);
watch(data, () => {
  older.value = [];
  olderCursor.value = undefined;
});
const entries = computed(() => [...(data.value?.items ?? []), ...older.value]);
const nextCursor = computed(() =>
  olderCursor.value === undefined ? (data.value?.nextCursor ?? null) : olderCursor.value,
);

async function onMore() {
  if (!nextCursor.value) return;
  loadingMore.value = true;
  try {
    const page = await $fetch<AdminActivityPage>('/api/admin/activity', {
      query: { ...filters.value, cursor: nextCursor.value },
    });
    older.value.push(...page.items);
    olderCursor.value = page.nextCursor;
  } catch {
    useToast().add({ color: 'error', title: t('admin.activity.loadFailed') });
  } finally {
    loadingMore.value = false;
  }
}

// The CSV is for site admins, and takes the same filters.
const csvHref = computed(() => {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(filters.value)) if (value) params.set(name, value);
  return `/api/admin/activity.csv?${params}`;
});
</script>

<template>
  <div class="flex max-w-4xl flex-col gap-4">
    <UAlert
      v-if="userId"
      color="secondary"
      variant="subtle"
      icon="i-lucide-user"
      :title="t('admin.activity.onePerson')"
      :actions="[
        {
          label: t('admin.activity.everyone'),
          color: 'neutral',
          variant: 'outline',
          onClick: showEveryone,
        },
      ]"
    />

    <div class="flex flex-wrap gap-3">
      <UInput
        v-model="search"
        type="search"
        icon="i-lucide-search"
        :placeholder="t('admin.activity.search')"
        :aria-label="t('admin.activity.search')"
        class="min-w-0 flex-1 basis-64"
      />
      <UInput v-model="from" type="date" :aria-label="t('admin.activity.from')" class="w-40" />
      <UInput v-model="to" type="date" :aria-label="t('admin.activity.to')" class="w-40" />
      <UButton
        v-if="isAdmin(me?.role)"
        :href="csvHref"
        external
        download
        icon="i-lucide-download"
        color="neutral"
        variant="soft"
        :label="t('admin.activity.csv')"
      />
    </div>

    <div
      v-if="areaChips.length > 1"
      class="flex flex-wrap gap-2"
      role="group"
      :aria-label="t('admin.activity.areasLabel')"
    >
      <UButton
        v-for="area in areaChips"
        :key="area"
        :label="t(`admin.activity.areas.${area}`)"
        :color="chosen.includes(area) ? 'secondary' : 'neutral'"
        :variant="chosen.includes(area) ? 'soft' : 'outline'"
        :aria-pressed="chosen.includes(area)"
        size="md"
        @click="toggle(area)"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.activity.loadFailed')"
    />

    <div v-else-if="pending && !data" class="flex flex-col gap-2" aria-hidden="true">
      <USkeleton v-for="n in 4" :key="n" class="h-12 w-full" />
    </div>

    <div v-else-if="!entries.length" class="flex flex-col items-center gap-3 py-16 text-center">
      <IconTile icon="i-lucide-history" />
      <h2 class="text-lg font-medium text-highlighted">{{ t('admin.activity.emptyTitle') }}</h2>
      <p class="max-w-md text-muted">{{ t('admin.activity.emptyLede') }}</p>
    </div>

    <template v-else>
      <ul class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
        <AdminActivityRow v-for="entry in entries" :key="entry.id" :entry="entry" />
      </ul>
      <div v-if="nextCursor" class="flex justify-center">
        <UButton
          color="neutral"
          variant="soft"
          size="md"
          :label="t('admin.activity.more')"
          :loading="loadingMore"
          @click="onMore"
        />
      </div>
    </template>
  </div>
</template>
