<script setup lang="ts">
import { eventRoomBody } from '#shared/schemas/events';
import type { EventRoomView } from '#shared/schemas/events';

// Adds a room, or renames one. Closes with the saved room, or null.
const props = defineProps<{ room?: EventRoomView; name?: string }>();
const emit = defineEmits<{ close: [room: EventRoomView | null] }>();

const { t } = useI18n();
const toast = useToast();

const state = reactive({
  name: props.room?.name ?? props.name ?? '',
  details: props.room?.details ?? '',
});
const pending = ref(false);

async function onSubmit() {
  pending.value = true;
  try {
    const body = { name: state.name, details: state.details };
    const room = props.room
      ? await eventAdminActions.updateRoom(props.room.id, body)
      : await eventAdminActions.addRoom(body);
    toast.add({
      title: t(props.room ? 'admin.events.rooms.saved' : 'admin.events.rooms.added'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', room);
  } catch (error) {
    const problem = error instanceof EventError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.events.errors.${problem}`),
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
    :title="t(props.room ? 'admin.events.rooms.editTitle' : 'admin.events.rooms.addTitle')"
    :close="false"
  >
    <template #body>
      <UForm
        id="event-room"
        :schema="eventRoomBody"
        :state="state"
        class="flex flex-col gap-5"
        @submit="onSubmit"
      >
        <UFormField :label="t('admin.events.rooms.name')" name="name" required>
          <UInput v-model="state.name" :maxlength="80" autofocus class="w-full" />
        </UFormField>
        <UFormField
          :label="t('admin.events.rooms.details')"
          :help="t('admin.events.rooms.detailsHelp')"
          name="details"
        >
          <UInput v-model="state.details" :maxlength="120" class="w-full" />
        </UFormField>
      </UForm>
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
          form="event-room"
          :loading="pending"
          :label="t(props.room ? 'admin.events.rooms.save' : 'admin.events.rooms.add')"
        />
      </div>
    </template>
  </UModal>
</template>
