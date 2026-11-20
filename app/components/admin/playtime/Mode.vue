<script setup lang="ts">
import { WardenConfirmModal } from '#components';

import type { PlaytimeMode } from '#shared/schemas/playtime';
import { PLAYTIME_MODES } from '#shared/schemas/playtime';

// The playtime mode, a setting of Settings, Playtime. A mode card saves at once, and asks before
// `enforce`. The rules are in AdminPlaytimeRules (/admin/playtime/rules).
const { t } = useI18n();
const toast = useToast();
const overlay = useOverlay();

const { data, error, refresh } = await usePlaytimeSettings();

function done(title: string) {
  toast.add({ title, color: 'success', icon: 'i-lucide-circle-check' });
}
function fail() {
  toast.add({
    title: t('admin.playtime.errors.failed'),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

const pendingMode = ref<PlaytimeMode | null>(null);
async function pickMode(mode: PlaytimeMode) {
  if (!data.value || mode === data.value.mode || pendingMode.value) return;
  if (mode === 'enforce') {
    const confirmed: unknown = await overlay.create(WardenConfirmModal).open({
      title: t('admin.playtime.mode.enforceTitle'),
      description: t('admin.playtime.mode.enforceBody'),
      confirmLabel: t('admin.playtime.mode.enforceConfirm'),
      cancelLabel: t('admin.cancel'),
      destructive: false,
    }).result;
    if (confirmed !== true) return;
  }
  pendingMode.value = mode;
  try {
    data.value = await playtimeAdminActions.saveSettings({ mode });
    done(t('admin.playtime.mode.done', { mode: t(`admin.playtime.mode.${mode}.label`) }));
  } catch {
    fail();
    await refresh();
  } finally {
    pendingMode.value = null;
  }
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.playtime.loadFailed')"
  />

  <div v-else class="flex max-w-4xl flex-col gap-6">
    <UAlert
      v-if="!data.flagEnabled"
      color="warning"
      variant="subtle"
      icon="i-lucide-toggle-left"
      :title="t('admin.playtime.flagOff')"
      :description="t('admin.playtime.flagOffBody')"
    />

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <div class="flex flex-col gap-1">
        <h2 class="text-xl">{{ t('admin.playtime.mode.title') }}</h2>
        <p class="text-muted">{{ t('admin.playtime.mode.lede') }}</p>
      </div>
      <div
        role="radiogroup"
        :aria-label="t('admin.playtime.mode.title')"
        class="grid gap-3 sm:grid-cols-3"
      >
        <button
          v-for="mode in PLAYTIME_MODES"
          :key="mode"
          type="button"
          role="radio"
          :aria-checked="data.mode === mode"
          :disabled="pendingMode !== null"
          class="flex flex-col items-start gap-1 rounded-lg border-2 bg-default p-4 text-left focus-visible:outline-2 focus-visible:outline-primary"
          :class="data.mode === mode ? 'border-secondary bg-accented' : 'border-transparent'"
          @click="pickMode(mode)"
        >
          <span class="font-display text-base text-highlighted">
            {{ t(`admin.playtime.mode.${mode}.label`) }}
          </span>
          <span class="text-sm text-muted">{{ t(`admin.playtime.mode.${mode}.description`) }}</span>
          <span class="mt-2 text-sm text-muted">{{ t(`admin.playtime.mode.${mode}.hint`) }}</span>
        </button>
      </div>
    </section>
  </div>
</template>
