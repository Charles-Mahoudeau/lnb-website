<script setup lang="ts">
import type { DropdownMenuItem, TabsItem } from '@nuxt/ui';

import { EventsAdminDuplicateModal, WardenConfirmModal } from '#components';

import { eventIdParams } from '#shared/schemas/events';
import type { EventBody } from '#shared/schemas/events';

// An event, for managers: the form, and its registrations in a second tab.
definePageMeta({
  eventsManagers: true,
  validate: (route) => eventIdParams.safeParse(route.params).success,
});

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const overlay = useOverlay();

const id = String(route.params.id);
const { data: event, error, refresh } = await useAdminEvent(id);
if (error.value || !event.value) {
  throw createError({ status: error.value?.status ?? 404, statusText: 'Event not found' });
}
const { data: registrations, refresh: refreshRegistrations } = await useEventRegistrations(id);

const tab = computed({
  get: () => (route.query.tab === 'registrations' ? 'registrations' : 'event'),
  set: (value) => void router.replace({ query: { ...route.query, tab: value } }),
});
const tabs = computed<TabsItem[]>(() => [
  { label: t('admin.events.tabs.event'), value: 'event' },
  {
    label: t('admin.events.tabs.registrations', {
      count: (event.value?.counts.registered ?? 0) + (event.value?.counts.waitlist ?? 0),
    }),
    value: 'registrations',
  },
]);

const pending = ref(false);

async function act(action: () => Promise<unknown>, success: string) {
  pending.value = true;
  try {
    await action();
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
    return true;
  } catch (failure) {
    const problem = failure instanceof EventError ? failure.problem : 'failed';
    toast.add({
      title: t(`admin.events.errors.${problem}`, t('admin.events.errors.failed')),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    return false;
  } finally {
    pending.value = false;
  }
}

const { confirmPush } = useEventPush();

// Saving can notify people: a new start tells everyone on the event, and more places give the
// waitlist theirs. Say so first, with the numbers. Drafts and small edits save without a question.
async function confirmSave(body: EventBody): Promise<boolean> {
  const current = event.value;
  if (!current || current.hidden) return true;
  if (Date.parse(body.startsAt) !== Date.parse(current.startsAt)) {
    const ok = await confirmPush({
      eventId: id,
      action: { action: 'reschedule', startsAt: body.startsAt },
      title: t('admin.events.push.rescheduleTitle'),
      description: t('admin.events.push.rescheduleBody'),
      confirmLabel: t('admin.events.push.saveSubmit'),
      cancelLabel: t('admin.events.push.back'),
      skipIfNobody: true,
    });
    if (!ok) return false;
  }
  const raised =
    current.counts.waitlist > 0 &&
    (body.capacity === null || (current.capacity !== null && body.capacity > current.capacity));
  if (raised) {
    return confirmPush({
      eventId: id,
      action: { action: 'capacity', capacity: body.capacity },
      title: t('admin.events.push.capacityTitle'),
      description: t('admin.events.push.capacityBody'),
      confirmLabel: t('admin.events.push.saveSubmit'),
      cancelLabel: t('admin.events.push.back'),
      skipIfNobody: true,
    });
  }
  return true;
}

async function onSubmit(body: EventBody) {
  if (!(await confirmSave(body))) return;
  if (await act(() => eventActions.update(id, body), t('admin.events.saved'))) await refresh();
}

const confirm = overlay.create(WardenConfirmModal);
const duplicateModal = overlay.create(EventsAdminDuplicateModal);

async function onDuplicate() {
  if (!event.value) return;
  const copy: unknown = await duplicateModal.open({ event: event.value }).result;
  if (typeof copy === 'string') await navigateTo(`/admin/events/${copy}`);
}

async function onCancelEvent() {
  const confirmed = await confirmPush({
    eventId: id,
    action: { action: 'cancel' },
    title: t('admin.events.cancelTitle', { name: event.value?.name }),
    description: t('admin.events.cancelBody'),
    confirmLabel: t('admin.events.cancelEvent'),
    cancelLabel: t('admin.events.keep'),
    destructive: true,
  });
  if (confirmed && (await act(() => eventActions.cancel(id), t('admin.events.cancelled'))))
    await refresh();
}

// Sends the new-event notification, once.
async function onAnnounce() {
  const confirmed = await confirmPush({
    eventId: id,
    action: { action: 'announce' },
    title: t('admin.events.push.announceTitle', { name: event.value?.name }),
    description: t('admin.events.push.announceBody'),
    confirmLabel: t('admin.events.push.announceSubmit'),
    cancelLabel: t('admin.events.push.back'),
  });
  if (
    confirmed &&
    (await act(() => eventActions.announce(id), t('admin.events.push.announceDone')))
  )
    await refresh();
}

const canAnnounce = computed(
  () =>
    !!event.value &&
    !event.value.hidden &&
    !event.value.cancelledAt &&
    !event.value.announcedAt &&
    Date.parse(event.value.startsAt) > Date.now(),
);

async function onDelete() {
  const confirmed: unknown = await confirm.open({
    title: t('admin.events.deleteTitle', { name: event.value?.name }),
    description: t('admin.events.deleteBody'),
    confirmLabel: t('admin.events.delete'),
    cancelLabel: t('admin.events.keep'),
    destructive: true,
  }).result;
  if (confirmed === true && (await act(() => eventActions.remove(id), t('admin.events.deleted'))))
    await navigateTo('/admin/events');
}

const menu = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t('admin.events.viewPage'),
      icon: 'i-lucide-external-link',
      to: `/events/${id}`,
      target: '_blank',
    },
    {
      label: t('admin.events.duplicate'),
      icon: 'i-lucide-copy',
      onSelect: () => void onDuplicate(),
    },
    ...(event.value?.announcedAt
      ? [{ label: t('admin.events.push.announced'), icon: 'i-lucide-bell-ring', disabled: true }]
      : canAnnounce.value
        ? [
            {
              label: t('admin.events.push.announce'),
              icon: 'i-lucide-bell-ring',
              onSelect: () => void onAnnounce(),
            },
          ]
        : []),
  ],
  [
    ...(event.value?.cancelledAt
      ? []
      : [
          {
            label: t('admin.events.cancelEvent'),
            icon: 'i-lucide-circle-x',
            color: 'error' as const,
            onSelect: () => void onCancelEvent(),
          },
        ]),
    {
      label: t('admin.events.delete'),
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => void onDelete(),
    },
  ],
]);

async function onBdeRetry() {
  await act(() => eventActions.bdeRetry(id), t('admin.events.bde.retried'));
  await refresh();
}

async function onRegistrationsChanged() {
  await Promise.all([refresh(), refreshRegistrations()]);
}
</script>

<template>
  <AdminPage
    v-if="event"
    :title="event.name"
    :parents="[{ label: t('admin.nav.events'), to: '/admin/events' }]"
  >
    <template #actions>
      <UBadge
        v-if="event.cancelledAt"
        color="error"
        variant="subtle"
        :label="t('events.cancelled')"
      />
      <UBadge
        v-else
        :color="event.hidden ? 'neutral' : 'success'"
        variant="subtle"
        :label="t(event.hidden ? 'admin.events.draftBadge' : 'admin.events.publishedBadge')"
      />
      <UDropdownMenu :items="menu" :content="{ align: 'end' }">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-ellipsis"
          :aria-label="t('admin.events.more')"
        />
      </UDropdownMenu>
      <UButton
        v-if="tab === 'event' && !event.cancelledAt"
        type="submit"
        form="event-form"
        :loading="pending"
        :label="t('admin.events.save')"
      />
    </template>

    <div class="flex flex-col gap-6">
      <UTabs v-model="tab" :items="tabs" :content="false" variant="link" class="w-full" />
      <template v-if="tab === 'event'">
        <UAlert
          v-if="event.cancelledAt"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-x"
          :title="t('admin.events.cancelledTitle')"
          :description="t('admin.events.cancelledBody')"
        />
        <EventsAdminForm
          :key="event.updatedAt"
          :event="event"
          :registrations="registrations?.items"
          class="max-w-7xl"
          @submit="onSubmit"
          @bde-retry="onBdeRetry"
        />
      </template>
      <EventsAdminRegistrations v-else :event="event" @changed="onRegistrationsChanged" />
    </div>
  </AdminPage>
</template>
