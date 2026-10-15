<script setup lang="ts">
import type { WardenBanBody } from '#shared/schemas/warden';

// Asks for a ban's reason and length, and shows when it ends. Closes with the ban to send.
defineProps<{ name: string }>();
const emit = defineEmits<{ close: [ban: WardenBanBody | null] }>();

const { t, locale } = useI18n();

const HOUR = 3600;
const presets = [
  { key: 'hour', seconds: HOUR },
  { key: 'day', seconds: 24 * HOUR },
  { key: 'week', seconds: 7 * 24 * HOUR },
  { key: 'month', seconds: 30 * 24 * HOUR },
  { key: 'permanent', seconds: null },
  { key: 'custom', seconds: undefined },
] as const;
type PresetKey = (typeof presets)[number]['key'];

const reason = ref('');
const preset = ref<PresetKey>('week');
const until = ref('');

// Ticks every 30 seconds so the end shown stays right while the dialog is open.
const now = ref(Date.now());
const timer = setInterval(() => (now.value = Date.now()), 30_000);
onBeforeUnmount(() => {
  clearInterval(timer);
});

const durationSeconds = computed<number | null | undefined>(() => {
  if (preset.value === 'custom') {
    const end = until.value ? new Date(until.value).getTime() : Number.NaN;
    const seconds = Math.round((end - now.value) / 1000);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
  }
  return presets.find((item) => item.key === preset.value)?.seconds;
});

const endText = computed(() => {
  if (durationSeconds.value === null) return t('wardenAdmin.banModal.never');
  if (durationSeconds.value === undefined) return t('wardenAdmin.banModal.pickDate');
  const end = new Date(now.value + durationSeconds.value * 1000).toISOString();
  return t('wardenAdmin.banModal.ends', { date: formatWardenDateTime(end, locale.value) });
});

const valid = computed(() => reason.value.trim().length > 0 && durationSeconds.value !== undefined);

function submit() {
  if (!valid.value || durationSeconds.value === undefined) return;
  emit('close', { reason: reason.value.trim(), durationSeconds: durationSeconds.value });
}
</script>

<template>
  <UModal
    :title="t('wardenAdmin.banModal.title', { name })"
    :description="t('wardenAdmin.banModal.lede')"
    :close="false"
  >
    <template #body>
      <form id="warden-ban" class="flex flex-col gap-5" @submit.prevent="submit">
        <UFormField :label="t('wardenAdmin.banModal.reason')" required>
          <UTextarea
            v-model="reason"
            :placeholder="t('wardenAdmin.banModal.reasonPlaceholder')"
            :rows="3"
            :maxlength="500"
            autoresize
            class="w-full"
          />
        </UFormField>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-medium">{{ t('wardenAdmin.banModal.length') }}</legend>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="item in presets"
              :key="item.key"
              type="button"
              size="md"
              color="neutral"
              :variant="preset === item.key ? 'soft' : 'outline'"
              :aria-pressed="preset === item.key"
              :label="t(`wardenAdmin.banModal.presets.${item.key}`)"
              @click="preset = item.key"
            />
          </div>
          <UInput
            v-if="preset === 'custom'"
            v-model="until"
            type="datetime-local"
            :aria-label="t('wardenAdmin.banModal.until')"
            class="w-full"
          />
          <span class="text-sm text-muted">{{ endText }}</span>
        </fieldset>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('wardenAdmin.banModal.cancel')"
          @click="emit('close', null)"
        />
        <UButton
          type="submit"
          form="warden-ban"
          color="error"
          variant="outline"
          :label="t('wardenAdmin.banModal.submit')"
          :disabled="!valid"
        />
      </div>
    </template>
  </UModal>
</template>
