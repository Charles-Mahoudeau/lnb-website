<script setup lang="ts">
import type { EventAdminView, EventUserOption } from '#shared/schemas/events';

// Registers an account by hand, found by name or email. Past the limit, the manager has to say
// so. Closes with true once added.
const props = defineProps<{ event: EventAdminView }>();
const emit = defineEmits<{ close: [added: boolean] }>();

const { t } = useI18n();
const toast = useToast();

const search = ref('');
const results = ref<EventUserOption[]>([]);
const picked = ref<EventUserOption>();
const force = ref(false);
const pending = ref(false);
const full = computed(
  () => props.event.capacity !== null && props.event.counts.registered >= props.event.capacity,
);

let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, (q) => {
  clearTimeout(timer);
  if (q.trim().length < 2) return;
  timer = setTimeout(() => {
    eventActions
      .searchUsers(q.trim())
      .then((found) => (results.value = found.items))
      .catch(() => (results.value = []));
  }, 250);
});

const items = computed(() =>
  results.value.map((option) => ({
    label: option.name,
    description: [option.email, option.school].filter(Boolean).join(', '),
    value: option,
  })),
);

async function onAdd() {
  if (!picked.value) return;
  pending.value = true;
  try {
    await eventActions.addRegistration(props.event.id, {
      userId: picked.value.userId,
      force: force.value,
    });
    toast.add({
      title: t('admin.events.registrations.added', { name: picked.value.name }),
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
    :title="t('admin.events.registrations.addTitle')"
    :description="t('admin.events.registrations.addLede')"
    :close="false"
  >
    <template #body>
      <div class="flex flex-col gap-5">
        <UFormField :label="t('admin.events.registrations.person')">
          <USelectMenu
            v-model="picked"
            v-model:search-term="search"
            :items="items"
            value-key="value"
            ignore-filter
            icon="i-lucide-search"
            :placeholder="t('admin.events.registrations.searchPlaceholder')"
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
          :disabled="!picked || (full && !force)"
          :loading="pending"
          :label="t('admin.events.registrations.addSubmit')"
          @click="onAdd"
        />
      </div>
    </template>
  </UModal>
</template>
