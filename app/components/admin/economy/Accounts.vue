<script setup lang="ts">
import type { EconomyAdminAccountRow, EconomyAdminAccountsQuery } from '#shared/schemas/economy';

// Every bank account, richest first, with a search and older pages on demand.
const { t, locale } = useI18n();
const toast = useToast();

const search = ref('');
const kind = ref<'all' | 'personal' | 'shared'>('all');
const query = ref<EconomyAdminAccountsQuery>({});
let timer: ReturnType<typeof setTimeout> | undefined;
watch([search, kind], () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    query.value = {
      q: search.value.trim() || undefined,
      kind: kind.value === 'all' ? undefined : kind.value,
    };
  }, 250);
});

const { data, error } = await useEconomyAdminAccounts(query);
const more = ref<EconomyAdminAccountRow[]>([]);
const moreCursor = ref<string | null | undefined>(undefined);
watch(data, () => {
  more.value = [];
  moreCursor.value = undefined;
});
const rows = computed(() => [...(data.value?.items ?? []), ...more.value]);
const nextCursor = computed(() =>
  moreCursor.value === undefined ? (data.value?.nextCursor ?? null) : moreCursor.value,
);
const loading = ref(false);
async function loadMore() {
  if (!nextCursor.value) return;
  loading.value = true;
  try {
    const page = await economyAdminActions.moreAccounts({
      ...query.value,
      cursor: nextCursor.value,
    });
    more.value.push(...page.items);
    moreCursor.value = page.nextCursor;
  } catch {
    toast.add({ title: t('economy.errors.failed'), color: 'error', icon: 'i-lucide-circle-alert' });
  } finally {
    loading.value = false;
  }
}

const kindItems = computed(() => [
  { label: t('admin.economy.accounts.allKinds'), value: 'all' },
  { label: t('admin.economy.accounts.personal'), value: 'personal' },
  { label: t('admin.economy.accounts.shared'), value: 'shared' },
]);

function label(row: EconomyAdminAccountRow): string {
  if (row.kind === 'shared') return row.name ?? '';
  return row.owner?.name ?? t('admin.economy.deletedAccount');
}
function sub(row: EconomyAdminAccountRow): string {
  if (row.kind === 'shared') {
    return t(
      'economy.baltop.sharedHint',
      { handle: row.handle, n: row.memberCount },
      row.memberCount,
    );
  }
  return row.owner?.username ?? t('admin.economy.accounts.personal');
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        class="min-w-64 flex-1"
        :placeholder="t('admin.economy.accounts.search')"
        :aria-label="t('admin.economy.accounts.search')"
      />
      <USelect
        v-model="kind"
        :items="kindItems"
        class="w-48"
        :aria-label="t('admin.economy.accounts.kind')"
      />
    </div>
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.economy.loadFailed')"
    />
    <p
      v-else-if="data && !rows.length"
      class="rounded-lg bg-elevated px-6 py-8 text-center text-muted"
    >
      {{ t('admin.economy.accounts.empty') }}
    </p>
    <ul v-else class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
      <li v-for="row in rows" :key="row.id">
        <NuxtLink
          :to="`/admin/economy/accounts/${row.id}`"
          class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-accented/40"
        >
          <span class="flex min-w-48 flex-1 flex-col">
            <span class="font-semibold text-highlighted">{{ label(row) }}</span>
            <span class="text-sm text-muted">{{ sub(row) }}</span>
          </span>
          <UBadge
            v-if="row.closed"
            color="neutral"
            variant="soft"
            size="sm"
            :label="t('admin.economy.closed')"
          />
          <UBadge
            v-else-if="row.frozen"
            color="warning"
            variant="subtle"
            size="sm"
            icon="i-lucide-snowflake"
            :label="t('economy.accounts.frozen')"
          />
          <span class="w-32 text-right font-bold tabular-nums">{{
            formatLnbits(row.balance, locale)
          }}</span>
        </NuxtLink>
      </li>
    </ul>
    <UButton
      v-if="nextCursor"
      color="neutral"
      variant="soft"
      class="self-start"
      :loading="loading"
      :label="t('admin.economy.more')"
      @click="loadMore"
    />
  </div>
</template>
