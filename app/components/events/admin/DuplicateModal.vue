<script setup lang="ts">
import type { EventAdminView } from '#shared/schemas/events';
import { isoToParisLocal, parisLocalToIso } from '#shared/utils/paris-time';

// Copies an event as a draft at new dates, a week later by default. Closes with the copy's id,
// or null.
const props = defineProps<{ event: EventAdminView }>();
const emit = defineEmits<{ close: [id: string | null] }>();

const { t } = useI18n();
const toast = useToast();

const WEEK = 7 * 86_400_000;
const length = Date.parse(props.event.endsAt) - Date.parse(props.event.startsAt);
const startsAt = ref(
  isoToParisLocal(new Date(Date.parse(props.event.startsAt) + WEEK).toISOString()),
);
const endsAt = computed(() => {
  const start = parisLocalToIso(startsAt.value);
  return start ? new Date(Date.parse(start) + length).toISOString() : null;
});
const pending = ref(false);

async function onDuplicate() {
  const start = parisLocalToIso(startsAt.value);
  if (!start || !endsAt.value) return;
  pending.value = true;
  try {
    const { id } = await eventActions.duplicate(props.event.id, {
      startsAt: start,
      endsAt: endsAt.value,
    });
    toast.add({
      title: t('admin.events.duplicated'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', id);
  } catch (error) {
    const problem = error instanceof EventError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.events.errors.${problem}`, t('admin.events.errors.failed')),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <UModal
    :title="t('admin.events.duplicateTitle')"
    :description="t('admin.events.duplicateLede')"
    :close="false"
  >
    <template #body>
      <UFormField :label="t('admin.events.form.startsAt')" :help="t('admin.events.duplicateHelp')">
        <UInput v-model="startsAt" type="datetime-local" class="w-full" />
      </UFormField>
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
          :disabled="!endsAt"
          :loading="pending"
          :label="t('admin.events.duplicate')"
          @click="onDuplicate"
        />
      </div>
    </template>
  </UModal>
</template>
