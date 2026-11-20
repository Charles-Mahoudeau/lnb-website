<script setup lang="ts">
// Registers one person to an upcoming event, chosen from the list. Closes with true once added.
const props = defineProps<{ userId: string; name: string }>();
const emit = defineEmits<{ close: [added: boolean] }>();

const { t, locale } = useI18n();
const toast = useToast();

const tab = ref<'upcoming'>('upcoming');
const { data } = await useAdminEvents(tab);
const eventId = ref<string>();
const force = ref(false);
const pending = ref(false);

const items = computed(() =>
  (data.value?.items ?? [])
    .filter((row) => !row.cancelledAt)
    .map((row) => ({
      label: row.name,
      description: formatWardenDateTime(row.startsAt, locale.value),
      value: row.id,
      full: row.capacity !== null && row.counts.registered >= row.capacity,
    })),
);
const full = computed(() => items.value.find((item) => item.value === eventId.value)?.full);

async function onAdd() {
  if (!eventId.value) return;
  pending.value = true;
  try {
    await eventActions.addRegistration(eventId.value, { userId: props.userId, force: force.value });
    toast.add({
      title: t('admin.events.registrations.added', { name: props.name }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
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
    :title="t('admin.person.register.title', { name })"
    :description="t('admin.person.register.lede')"
    :close="false"
  >
    <template #body>
      <div class="flex flex-col gap-5">
        <p v-if="!items.length" class="text-muted">{{ t('admin.person.register.empty') }}</p>
        <UFormField v-else :label="t('admin.person.register.event')">
          <USelectMenu
            v-model="eventId"
            :items="items"
            value-key="value"
            :placeholder="t('admin.person.register.placeholder')"
            class="w-full"
          />
        </UFormField>
        <UCheckbox
          v-if="full"
          v-model="force"
          :label="t('admin.events.registrations.force')"
          :description="t('admin.events.registrations.forceHelp')"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('admin.cancel')"
          @click="emit('close', false)"
        />
        <UButton
          :disabled="!eventId || (full && !force)"
          :loading="pending"
          :label="t('admin.events.registrations.addSubmit')"
          @click="onAdd"
        />
      </div>
    </template>
  </UModal>
</template>
