<script setup lang="ts">
import type { FormError } from '@nuxt/ui';

import { EventsAdminRoomModal } from '#components';

import { eventBody, EVENT_DESCRIPTION_MAX, EVENT_NAME_MAX } from '#shared/schemas/events';
import type { EventAdminView, EventBody, EventRegistrationRow } from '#shared/schemas/events';
import { isoToParisLocal, parisLocalToIso } from '#shared/utils/paris-time';

// The event form: every section on one page, beside a preview of how the event will look. Times
// are Paris wall-clock times, whatever the device says. Emits the whole event on submit; the page
// saves it. Its submit button can sit outside it, with `form="event-form"`.
const props = defineProps<{
  event?: EventAdminView;
  /** On an existing event, to warn when a school with registrants is unticked. */
  registrations?: readonly EventRegistrationRow[];
}>();
const emit = defineEmits<{ submit: [body: EventBody] }>();

const { t, locale } = useI18n();
const overlay = useOverlay();

const { data: rooms, refresh: refreshRooms } = await useEventRooms();
const { data: types } = await useEventTypes();

const HOURS = 3_600_000;
const initial = props.event;
const state = reactive({
  name: initial?.name ?? '',
  description: initial?.description ?? '',
  roomId: initial?.room.id,
  typeId: initial?.type.id,
  schools: initial?.schools ?? Object.keys(SCHOOLS),
  startsAt: initial ? isoToParisLocal(initial.startsAt) : '',
  endsAt: initial ? isoToParisLocal(initial.endsAt) : '',
  limited: initial ? initial.capacity !== null : false,
  capacity: initial?.capacity ?? 30,
  registrationOpensAt: initial?.registrationOpensAt
    ? isoToParisLocal(initial.registrationOpensAt)
    : '',
  registrationClosesAt: initial?.registrationClosesAt
    ? isoToParisLocal(initial.registrationClosesAt)
    : '',
  // Empty means free. An emptied number input gives '', which counts as empty too.
  price: initial?.price ?? undefined,
  hidden: initial?.hidden ?? true,
  bdeSync: initial?.bdeSync ?? false,
});

// A new start fills an empty end with start + 3 h.
watch(
  () => state.startsAt,
  (startsAt) => {
    const start = parisLocalToIso(startsAt);
    if (start && !state.endsAt) {
      state.endsAt = isoToParisLocal(new Date(Date.parse(start) + 3 * HOURS).toISOString());
    }
  },
);

/** The form as the API takes it. Missing values stay empty, so validation names them. */
function body(): EventBody {
  return {
    name: state.name,
    description: state.description,
    roomId: state.roomId ?? '',
    typeId: state.typeId ?? '',
    schools: state.schools,
    startsAt: parisLocalToIso(state.startsAt) ?? '',
    endsAt: parisLocalToIso(state.endsAt) ?? '',
    capacity: state.limited ? state.capacity : null,
    registrationOpensAt: parisLocalToIso(state.registrationOpensAt),
    registrationClosesAt: parisLocalToIso(state.registrationClosesAt),
    price: typeof state.price === 'number' ? state.price : null,
    hidden: state.hidden,
    bdeSync: state.bdeSync,
  };
}

// The shared schema checks the form, with our own words for each problem.
const CUSTOM = new Set([
  'endsBeforeStart',
  'closesAfterStart',
  'opensAfterClose',
  'bdeName',
  'bdeDescription',
]);
function validate(): FormError[] {
  const result = eventBody.safeParse(body());
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const field = String(issue.path[0] ?? 'name');
    const key = CUSTOM.has(issue.message) ? issue.message : field;
    return { name: field, message: t(`admin.events.form.errors.${key}`) };
  });
}

function onSubmit() {
  emit('submit', eventBody.parse(body()));
}

const roomItems = computed(() =>
  (rooms.value?.items ?? [])
    .filter((room) => !room.archived || room.id === initial?.room.id)
    .map((room) => ({ label: room.name, value: room.id, description: room.details ?? undefined })),
);
const typeItems = computed(() =>
  (types.value?.items ?? [])
    .filter((type) => !type.archived || type.id === initial?.type.id)
    .map((type) => ({
      label: locale.value.startsWith('fr') ? type.nameFr : type.nameEn,
      value: type.id,
      icon: type.icon,
    })),
);
const selectedType = computed(() => typeItems.value.find((item) => item.value === state.typeId));
const schoolItems = Object.entries(SCHOOLS).map(([value, label]) => ({ label, value }));

const roomModal = overlay.create(EventsAdminRoomModal);
async function onCreateRoom(name: string) {
  const room: unknown = await roomModal.open({ name }).result;
  if (room && typeof room === 'object' && 'id' in room) {
    await refreshRooms();
    state.roomId = String(room.id);
  }
}

// Registrants whose school was just unticked stay registered: say so.
const strandedRegistrants = computed(() => {
  const schools = new Set(state.schools);
  const tenantOf = Object.fromEntries(Object.entries(SCHOOLS).map(([tid, name]) => [name, tid]));
  return (props.registrations ?? []).filter(
    (row) => row.school && !schools.has(tenantOf[row.school] ?? ''),
  ).length;
});

const preview = computed(() => ({
  name: state.name || t('admin.events.form.untitled'),
  startsAt: parisLocalToIso(state.startsAt),
  endsAt: parisLocalToIso(state.endsAt),
  room: roomItems.value.find((item) => item.value === state.roomId)?.label ?? '',
  type: selectedType.value,
  description: state.description,
}));
</script>

<template>
  <div class="grid items-start gap-8 xl:grid-cols-12">
    <UForm
      id="event-form"
      :state="state"
      :validate="validate"
      :validate-on="['blur', 'change']"
      class="flex min-w-0 flex-col gap-4 xl:col-span-8"
      @submit="onSubmit"
    >
      <section class="flex flex-col gap-5 rounded-lg bg-elevated p-5">
        <h2 class="text-lg font-bold text-highlighted">{{ t('admin.events.form.details') }}</h2>
        <UFormField
          :label="t('admin.events.form.name')"
          name="name"
          required
          :help="t('admin.events.form.nameHelp')"
        >
          <UInput v-model="state.name" :maxlength="EVENT_NAME_MAX" class="w-full" />
        </UFormField>
        <UFormField
          :label="t('admin.events.form.description')"
          name="description"
          required
          :help="t('admin.events.form.descriptionHelp')"
        >
          <UTextarea
            v-model="state.description"
            :maxlength="EVENT_DESCRIPTION_MAX"
            :rows="8"
            autoresize
            class="w-full"
          />
        </UFormField>
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField :label="t('admin.events.form.type')" name="typeId" required>
            <USelectMenu
              v-model="state.typeId"
              :items="typeItems"
              value-key="value"
              :icon="selectedType?.icon"
              :placeholder="t('admin.events.form.pickType')"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.events.form.room')" name="roomId" required>
            <USelectMenu
              v-model="state.roomId"
              :items="roomItems"
              value-key="value"
              icon="i-lucide-map-pin"
              create-item
              :placeholder="t('admin.events.form.pickRoom')"
              class="w-full"
              @create="onCreateRoom"
            />
          </UFormField>
        </div>
      </section>

      <section class="flex flex-col gap-5 rounded-lg bg-elevated p-5">
        <h2 class="text-lg font-bold text-highlighted">{{ t('admin.events.form.when') }}</h2>
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField :label="t('admin.events.form.startsAt')" name="startsAt" required>
            <UInput v-model="state.startsAt" type="datetime-local" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('admin.events.form.endsAt')"
            name="endsAt"
            required
            :help="t('admin.events.form.endsAtHelp')"
          >
            <UInput v-model="state.endsAt" type="datetime-local" class="w-full" />
          </UFormField>
        </div>
        <p class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-globe" class="size-4 shrink-0" />
          {{ t('admin.events.form.parisTime') }}
        </p>
      </section>

      <section class="flex flex-col gap-5 rounded-lg bg-elevated p-5">
        <h2 class="text-lg font-bold text-highlighted">
          {{ t('admin.events.form.registration') }}
        </h2>
        <UFormField
          :label="t('admin.events.form.schools')"
          name="schools"
          required
          :help="t('admin.events.form.schoolsHelp')"
        >
          <UCheckboxGroup
            v-model="state.schools"
            :items="schoolItems"
            orientation="horizontal"
            variant="card"
          />
        </UFormField>
        <UAlert
          v-if="strandedRegistrants"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="
            t('admin.events.form.stranded', { count: strandedRegistrants }, strandedRegistrants)
          "
        />
        <USwitch
          v-model="state.limited"
          :label="t('admin.events.form.limited')"
          :description="t('admin.events.form.limitedHelp')"
        />
        <UFormField
          v-if="state.limited"
          :label="t('admin.events.form.capacity')"
          name="capacity"
          class="sm:w-48"
        >
          <UInputNumber v-model="state.capacity" :min="1" :max="10000" class="w-full" />
        </UFormField>
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField
            :label="t('admin.events.form.opensAt')"
            name="registrationOpensAt"
            :help="t('admin.events.form.opensAtHelp')"
          >
            <UInput v-model="state.registrationOpensAt" type="datetime-local" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('admin.events.form.closesAt')"
            name="registrationClosesAt"
            :help="t('admin.events.form.closesAtHelp')"
          >
            <UInput v-model="state.registrationClosesAt" type="datetime-local" class="w-full" />
          </UFormField>
        </div>
        <UFormField
          :label="t('admin.events.form.price')"
          name="price"
          :help="t('admin.events.form.priceHelp')"
          class="sm:w-72"
        >
          <UInput
            v-model.number="state.price"
            type="number"
            min="0"
            max="1000"
            :placeholder="t('events.free')"
            class="w-full"
          >
            <template #trailing><span class="text-muted">€</span></template>
          </UInput>
        </UFormField>
      </section>

      <section class="flex flex-col gap-5 rounded-lg bg-elevated p-5">
        <h2 class="text-lg font-bold text-highlighted">{{ t('admin.events.form.publishing') }}</h2>
        <USwitch
          v-model="state.hidden"
          :label="t('admin.events.form.draft')"
          :description="t('admin.events.form.draftHelp')"
        />
      </section>
    </UForm>

    <EventsAdminPreview v-bind="preview" class="xl:sticky xl:top-4 xl:col-span-4" />
  </div>
</template>
