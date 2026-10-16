<script setup lang="ts">
import { eventTypeBody } from '#shared/schemas/events';
import type { EventTypeView } from '#shared/schemas/events';

// Adds an event type, or changes one. Closes with the saved type, or null.
const props = defineProps<{ type?: EventTypeView }>();
const emit = defineEmits<{ close: [type: EventTypeView | null] }>();

const { t } = useI18n();
const toast = useToast();

const state = reactive({
  nameEn: props.type?.nameEn ?? '',
  nameFr: props.type?.nameFr ?? '',
  icon: props.type?.icon ?? 'i-lucide-calendar',
});
const pending = ref(false);
const validIcon = computed(() => eventTypeBody.shape.icon.safeParse(state.icon).success);

async function onSubmit() {
  pending.value = true;
  try {
    const body = { ...state };
    const type = props.type
      ? await eventAdminActions.updateType(props.type.id, body)
      : await eventAdminActions.addType(body);
    toast.add({
      title: t(props.type ? 'admin.events.types.saved' : 'admin.events.types.added'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', type);
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
    :title="t(props.type ? 'admin.events.types.editTitle' : 'admin.events.types.addTitle')"
    :close="false"
  >
    <template #body>
      <UForm
        id="event-type"
        :schema="eventTypeBody"
        :state="state"
        class="flex flex-col gap-5"
        @submit="onSubmit"
      >
        <UFormField :label="t('admin.events.types.nameEn')" name="nameEn" required>
          <UInput v-model="state.nameEn" :maxlength="40" autofocus class="w-full" />
        </UFormField>
        <UFormField :label="t('admin.events.types.nameFr')" name="nameFr" required>
          <UInput v-model="state.nameFr" :maxlength="40" class="w-full" />
        </UFormField>
        <UFormField :label="t('admin.events.types.icon')" name="icon" required>
          <template #help>
            <i18n-t keypath="admin.events.types.iconHelp" tag="span" scope="global">
              <template #link>
                <ULink to="https://lucide.dev/icons/" target="_blank" class="underline">
                  lucide.dev
                </ULink>
              </template>
            </i18n-t>
          </template>
          <UInput v-model="state.icon" class="w-full">
            <template #leading>
              <UIcon :name="validIcon ? state.icon : 'i-lucide-circle-help'" class="size-5" />
            </template>
          </UInput>
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
          form="event-type"
          :loading="pending"
          :label="t(props.type ? 'admin.events.types.save' : 'admin.events.types.add')"
        />
      </div>
    </template>
  </UModal>
</template>
