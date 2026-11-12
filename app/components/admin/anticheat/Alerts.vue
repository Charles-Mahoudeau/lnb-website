<script setup lang="ts">
import type { AnticheatAlertRow } from '#shared/schemas/anticheat';

// The open alerts at the top of the review queue, each with a ghost "Dismiss".
const { t, d } = useI18n();
const toast = useToast();
const { data, refresh } = useAnticheatAlerts();

const more = ref<AnticheatAlertRow[]>([]);
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
    const page = await anticheatActions.moreAlerts(nextCursor.value);
    more.value.push(...page.items);
    moreCursor.value = page.nextCursor;
  } catch {
    toast.add({
      title: t('admin.anticheat.errors.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    loadingMore.value = false;
  }
}

async function dismiss(id: number) {
  try {
    await anticheatActions.dismissAlert(id);
    toast.add({
      title: t('admin.anticheat.alerts.dismissed'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch {
    toast.add({
      title: t('admin.anticheat.errors.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
  await refreshNuxtData('anticheat-summary');
}

function sentence(alert: AnticheatAlertRow) {
  const count = Number(alert.data.affectedPlayers ?? 0);
  const params = {
    player: alert.player?.username ?? alert.player?.name ?? t('admin.anticheat.alerts.someone'),
    file:
      alert.file?.name ??
      (alert.data.name as string | undefined) ??
      t('admin.anticheat.alerts.aFile'),
    score: Number(alert.data.score ?? 0),
    count,
  };
  return alert.kind === 'banAffectsPlayers'
    ? t(`admin.anticheat.alerts.kinds.${alert.kind}`, params, count)
    : t(`admin.anticheat.alerts.kinds.${alert.kind}`, params);
}
</script>

<template>
  <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
    <h2 class="text-lg font-bold text-highlighted">{{ t('admin.anticheat.alerts.title') }}</h2>
    <p v-if="!rows.length" class="text-muted">{{ t('admin.anticheat.alerts.empty') }}</p>
    <ul v-else class="flex flex-col divide-y divide-default">
      <li v-for="alert in rows" :key="alert.id" class="flex items-center gap-3 py-2.5">
        <span class="flex min-w-0 flex-1 flex-col">
          <NuxtLink
            v-if="alert.player"
            :to="`/admin/warden/players/${alert.player.userId}#anticheat`"
            class="text-highlighted hover:underline"
            >{{ sentence(alert) }}</NuxtLink
          >
          <span v-else class="text-highlighted">{{ sentence(alert) }}</span>
          <span class="text-sm text-muted tabular-nums">
            {{
              d(alert.createdAt, {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Europe/Paris',
              })
            }}
          </span>
        </span>
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('admin.anticheat.alerts.dismiss')"
          @click="dismiss(alert.id)"
        />
      </li>
    </ul>
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
</template>
