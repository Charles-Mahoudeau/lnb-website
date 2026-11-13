<script setup lang="ts">
import type { AdminGhost } from '#shared/schemas/admin';
import type { EventAdminView, EventUserOption } from '#shared/schemas/events';
import type { PushImpactView } from '#shared/schemas/push';

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
// "New ghost" makes an account for someone who hasn't signed in yet (docs/ghost-accounts.md).
const tab = ref<'existing' | 'ghost'>('existing');
const tabs = computed(() => [
  { label: t('admin.ghost.tabExisting'), value: 'existing' },
  { label: t('admin.ghost.tabNew'), value: 'ghost' },
]);
const ghostPending = ref(false);

// Once made, the ghost is picked like any account: the manager still adds them below.
function onGhost(ghost: AdminGhost) {
  picked.value = { ...ghost, ghost: true };
  tab.value = 'existing';
}

// Adding someone sends them a notification, if they have it on: say so once they're picked.
const { impact: countImpact } = useEventPush();
const notified = ref<PushImpactView | null>(null);
watch(picked, async (person) => {
  notified.value = null;
  if (!person) return;
  const counted = await countImpact(props.event.id, { action: 'add', userId: person.userId });
  if (picked.value === person) notified.value = counted;
});
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
    description: [option.email, option.school, option.ghost ? t('admin.ghost.badge') : null]
      .filter(Boolean)
      .join(', '),
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
        <UTabs v-model="tab" :items="tabs" :content="false" variant="pill" class="w-full" />
        <AdminGhostForm
          v-if="tab === 'ghost'"
          id="registration-ghost"
          via="events"
          @pending="ghostPending = $event"
          @created="onGhost"
        />
        <UFormField v-else :label="t('admin.events.registrations.person')">
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
        <UAlert
          v-if="tab === 'existing' && picked && notified"
          :color="notified.overCap > 0 ? 'warning' : 'neutral'"
          variant="subtle"
          :icon="notified.recipients > 0 ? 'i-lucide-bell' : 'i-lucide-bell-off'"
          :description="
            notified.recipients > 0
              ? t('admin.events.push.addWillNotify', { name: picked.name }) +
                (notified.overCap > 0
                  ? ' ' +
                    t('admin.events.push.overCap', {
                      count: notified.overCap,
                      cap: notified.weeklyCap,
                    })
                  : '')
              : t('admin.events.push.addWontNotify', { name: picked.name })
          "
        />
        <UCheckbox
          v-if="full && tab === 'existing'"
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
          v-if="tab === 'ghost'"
          type="submit"
          form="registration-ghost"
          :loading="ghostPending"
          :label="t('admin.ghost.submit')"
        />
        <UButton
          v-else
          :disabled="!picked || (full && !force)"
          :loading="pending"
          :label="t('admin.events.registrations.addSubmit')"
          @click="onAdd"
        />
      </div>
    </template>
  </UModal>
</template>
