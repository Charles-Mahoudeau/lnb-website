<script setup lang="ts">
import type { AdminBanBody } from '#shared/schemas/admin';

// Asks for a site ban's reason and length. Closes with the ban to send, or null.
defineProps<{ name: string }>();
const emit = defineEmits<{ close: [ban: AdminBanBody | null] }>();

const { t, locale } = useI18n();

const DAY = 24 * 3600;
const presets = [
  { key: 'day', seconds: DAY },
  { key: 'week', seconds: 7 * DAY },
  { key: 'month', seconds: 30 * DAY },
  { key: 'permanent', seconds: null },
] as const;
type PresetKey = (typeof presets)[number]['key'];

const reason = ref('');
const preset = ref<PresetKey>('week');

const durationSeconds = computed(
  () => presets.find((item) => item.key === preset.value)?.seconds ?? null,
);
const endText = computed(() => {
  if (durationSeconds.value === null) return t('admin.banModal.never');
  const end = new Date(Date.now() + durationSeconds.value * 1000).toISOString();
  return t('admin.banModal.ends', { date: formatWardenDateTime(end, locale.value) });
});

const valid = computed(() => reason.value.trim().length > 0);

function submit() {
  if (!valid.value) return;
  emit('close', { reason: reason.value.trim(), durationSeconds: durationSeconds.value });
}
</script>

<template>
  <UModal
    :title="t('admin.banModal.title', { name })"
    :description="t('admin.banModal.lede')"
    :close="false"
  >
    <template #body>
      <form id="admin-ban" class="flex flex-col gap-5" @submit.prevent="submit">
        <UFormField
          :label="t('admin.banModal.reason')"
          :hint="t('admin.banModal.reasonHint')"
          required
        >
          <UTextarea v-model="reason" :rows="3" :maxlength="500" autoresize class="w-full" />
        </UFormField>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-medium">{{ t('admin.banModal.length') }}</legend>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="item in presets"
              :key="item.key"
              type="button"
              size="md"
              color="neutral"
              :variant="preset === item.key ? 'soft' : 'outline'"
              :aria-pressed="preset === item.key"
              :label="t(`admin.banModal.presets.${item.key}`)"
              @click="preset = item.key"
            />
          </div>
          <span class="text-sm text-muted">{{ endText }}</span>
        </fieldset>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('admin.cancel')"
          @click="emit('close', null)"
        />
        <UButton
          type="submit"
          form="admin-ban"
          color="error"
          variant="outline"
          :label="t('admin.banModal.submit')"
          :disabled="!valid"
        />
      </div>
    </template>
  </UModal>
</template>
