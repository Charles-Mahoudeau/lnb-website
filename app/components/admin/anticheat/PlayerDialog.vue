<script setup lang="ts">
// Asks for a reason before an admin adjusts a player's trust score or clears a manual hold. The
// reason is kept on the player's timeline. Closes with the values, or null when cancelled.
const props = defineProps<{ mode: 'score' | 'clear'; score: number }>();
const emit = defineEmits<{ close: [result: { score: number; reason: string } | null] }>();

const { t } = useI18n();
const score = ref(props.score);
const reason = ref('');
const valid = computed(
  () =>
    reason.value.trim().length > 0 &&
    (props.mode === 'clear' ||
      (Number.isInteger(score.value) && score.value >= 0 && score.value <= 100)),
);
const submit = () => {
  if (valid.value) emit('close', { score: score.value, reason: reason.value.trim() });
};
</script>

<template>
  <UModal
    :title="t(`admin.anticheat.panel.dialog.${mode}Title`)"
    :description="t(`admin.anticheat.panel.dialog.${mode}Body`)"
    :close="false"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField v-if="mode === 'score'" :label="t('admin.anticheat.panel.dialog.score')">
          <UInputNumber v-model="score" :min="0" :max="100" class="w-32" />
        </UFormField>
        <UFormField :label="t('admin.anticheat.panel.dialog.reason')" required>
          <UTextarea v-model="reason" :rows="2" :maxlength="500" autoresize class="w-full" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('admin.anticheat.cancel')"
          @click="emit('close', null)"
        />
        <UButton
          :disabled="!valid"
          :label="t(`admin.anticheat.panel.dialog.confirm${mode === 'score' ? 'Score' : 'Clear'}`)"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
