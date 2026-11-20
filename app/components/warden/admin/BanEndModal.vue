<script setup lang="ts">
// Moves the end of a ban in force, or makes it permanent. Closes with the new end as an ISO date,
// `null` for permanent, or `undefined` when cancelled.
const props = defineProps<{ name: string; current: string | null }>();
const emit = defineEmits<{ close: [end: string | null | undefined] }>();

const { t, locale } = useI18n();

const permanent = ref(props.current === null);
// A datetime-local value, in the browser's time zone.
const until = ref('');
const valid = computed(() => {
  if (permanent.value) return true;
  const end = until.value ? new Date(until.value).getTime() : Number.NaN;
  return Number.isFinite(end) && end > Date.now();
});

function submit() {
  if (!valid.value) return;
  emit('close', permanent.value ? null : new Date(until.value).toISOString());
}
</script>

<template>
  <UModal
    :title="t('wardenAdmin.banEndModal.title', { name })"
    :description="
      current
        ? t('wardenAdmin.banEndModal.current', { date: formatWardenDateTime(current, locale) })
        : t('wardenAdmin.banEndModal.currentPermanent')
    "
    :close="false"
  >
    <template #body>
      <form id="warden-ban-end" class="flex flex-col gap-5" @submit.prevent="submit">
        <USwitch v-model="permanent" :label="t('wardenAdmin.banEndModal.permanent')" />
        <UFormField
          v-if="!permanent"
          :label="t('wardenAdmin.banEndModal.until')"
          :help="t('wardenAdmin.banEndModal.help')"
        >
          <UInput v-model="until" type="datetime-local" class="w-full" />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('wardenAdmin.banEndModal.cancel')"
          @click="emit('close', undefined)"
        />
        <UButton
          type="submit"
          form="warden-ban-end"
          :label="t('wardenAdmin.banEndModal.submit')"
          :disabled="!valid"
        />
      </div>
    </template>
  </UModal>
</template>
