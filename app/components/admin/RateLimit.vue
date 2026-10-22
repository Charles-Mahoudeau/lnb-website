<script setup lang="ts">
import { EVENT_IP_MULTIPLIER, RATE_LIMIT_MODES } from '#shared/rate-limit';
import type { RateLimitMode } from '#shared/rate-limit';

// Rate limiting: three modes, one card each. Picking one saves at once.
const { t, locale } = useI18n();
const toast = useToast();
const { data, error, refresh } = await useAdminRateLimit();

const pending = ref<RateLimitMode | null>(null);
async function onPick(mode: RateLimitMode) {
  if (!data.value || mode === data.value.mode || pending.value) return;
  pending.value = mode;
  try {
    data.value = await setAdminRateLimit(mode);
    toast.add({
      title: t('admin.rateLimit.changed', { mode: t(`admin.rateLimit.modes.${mode}.label`) }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch {
    toast.add({
      title: t('admin.rateLimit.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    await refresh();
  } finally {
    pending.value = null;
  }
}

const changed = computed(() => {
  const state = data.value;
  if (!state?.updatedAt) return null;
  const date = new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(state.updatedAt));
  return t('admin.rateLimit.changedBy', { name: state.updatedByName ?? '?', date });
});
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.rateLimit.loadFailed')"
  />

  <div v-else class="flex max-w-3xl flex-col gap-6">
    <UAlert
      v-if="data.mode === 'off'"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('admin.rateLimit.offTitle')"
      :description="t('admin.rateLimit.offDescription')"
      :actions="[
        {
          label: t('admin.rateLimit.backToNormal'),
          color: 'primary',
          loading: pending === 'normal',
          onClick: () => onPick('normal'),
        },
      ]"
    />

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <div class="flex flex-col gap-1">
        <h2 class="text-xl">{{ t('admin.rateLimit.title') }}</h2>
        <p class="text-muted">{{ t('admin.rateLimit.lede') }}</p>
      </div>

      <div
        role="radiogroup"
        :aria-label="t('admin.rateLimit.title')"
        class="grid gap-3 sm:grid-cols-3"
      >
        <button
          v-for="mode in RATE_LIMIT_MODES"
          :key="mode"
          type="button"
          role="radio"
          :aria-checked="data.mode === mode"
          :disabled="pending !== null"
          class="flex flex-col items-start gap-1 rounded-lg border-2 bg-default p-4 text-left focus-visible:outline-2 focus-visible:outline-primary"
          :class="data.mode === mode ? 'border-secondary bg-accented' : 'border-transparent'"
          @click="onPick(mode)"
        >
          <span class="font-display text-base text-highlighted">
            {{ t(`admin.rateLimit.modes.${mode}.label`) }}
          </span>
          <span class="text-sm text-muted">
            {{ t(`admin.rateLimit.modes.${mode}.description`, { factor: EVENT_IP_MULTIPLIER }) }}
          </span>
        </button>
      </div>

      <p v-if="changed" class="text-sm text-muted">{{ changed }}</p>
      <p class="text-sm text-muted">{{ t('admin.rateLimit.unaffected') }}</p>
    </section>
  </div>
</template>
