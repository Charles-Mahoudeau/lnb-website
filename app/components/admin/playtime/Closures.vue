<script setup lang="ts">
import { WardenConfirmModal } from '#components';

import type { PlaytimeClosureRow } from '#shared/schemas/playtime';
import { addDays, mondayOf, parisDate } from '#shared/utils/paris-time';
import { SCHOOLS } from '#shared/utils/schools';

// The Closures tab: the list first (with "Skip this week"), then a calendar to choose dates by
// dragging and the form beside it. Closures made for an event follow the event: no edit, no delete.
const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();

const { data, error } = await usePlaytimeClosures();
const closures = computed(() => data.value ?? []);

const today = parisDate(Date.now());
const monday = mondayOf(today);
const sunday = addDays(monday, 6);

const sorted = computed(() =>
  [...closures.value].sort((a, b) =>
    a.startsOn === b.startsOn ? a.id - b.id : a.startsOn < b.startsOn ? 1 : -1,
  ),
);
const weekSkipped = computed(() =>
  closures.value.some((c) => !c.tenantIds && c.startsOn <= monday && c.endsOn >= sunday),
);

const dateFormat = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
);
const day = (iso: string) => dateFormat.value.format(new Date(`${iso}T12:00:00Z`));
const range = (c: { startsOn: string; endsOn: string }) =>
  c.startsOn === c.endsOn ? day(c.startsOn) : `${day(c.startsOn)} – ${day(c.endsOn)}`;
const status = (c: PlaytimeClosureRow) =>
  c.endsOn < today ? 'past' : c.startsOn <= today ? 'active' : 'upcoming';
const who = (c: PlaytimeClosureRow) =>
  c.tenantIds
    ? c.tenantIds.map((id) => SCHOOLS[id] ?? id).join(', ')
    : t('admin.playtime.closures.everyone');

function fail(problem: string) {
  toast.add({
    title: t(`admin.playtime.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}
function done(title: string) {
  toast.add({ title, color: 'success', icon: 'i-lucide-circle-check' });
}
const problemOf = (e: unknown) => (e instanceof PlaytimeAdminError ? e.problem : 'failed');

const busy = ref(false);
async function skip() {
  if (busy.value) return;
  busy.value = true;
  try {
    data.value = await playtimeAdminActions.skipWeek();
    done(t('admin.playtime.closures.skipped'));
  } catch (e) {
    fail(problemOf(e));
  } finally {
    busy.value = false;
  }
}

async function remove(c: PlaytimeClosureRow) {
  const confirmed: unknown = await overlay.create(WardenConfirmModal).open({
    title: t('admin.playtime.closures.deleteTitle', { label: c.label }),
    description: t('admin.playtime.closures.deleteBody'),
    confirmLabel: t('admin.playtime.closures.delete'),
    cancelLabel: t('admin.cancel'),
    destructive: true,
  }).result;
  if (confirmed !== true) return;
  try {
    data.value = await playtimeAdminActions.deleteClosure(c.id);
    done(t('admin.playtime.closures.deleted'));
  } catch (e) {
    fail(problemOf(e));
  }
}

// The form, and the calendar that fills its dates.
const label = ref('');
const from = ref('');
const to = ref('');
const scope = ref<'all' | 'schools'>('all');
const tenantIds = ref<string[]>([]);
const schoolItems = Object.entries(SCHOOLS).map(([value, text]) => ({ value, label: text }));
const formValid = computed(
  () =>
    label.value.trim().length > 0 &&
    !!from.value &&
    !!to.value &&
    to.value >= from.value &&
    (scope.value === 'all' || tenantIds.value.length > 0),
);

async function add() {
  if (!formValid.value || busy.value) return;
  busy.value = true;
  try {
    data.value = await playtimeAdminActions.addClosure({
      label: label.value.trim(),
      startsOn: from.value,
      endsOn: to.value,
      tenantIds: scope.value === 'all' ? null : tenantIds.value,
    });
    label.value = '';
    from.value = '';
    to.value = '';
    scope.value = 'all';
    tenantIds.value = [];
    done(t('admin.playtime.closures.added'));
  } catch (e) {
    fail(problemOf(e));
  } finally {
    busy.value = false;
  }
}

const [startYear, startMonth] = today.split('-').map(Number) as [number, number];
const offset = ref(0);
const months = computed(() =>
  [0, 1, 2].map((i) => {
    const index = startMonth - 1 + offset.value + i;
    const year = startYear + Math.floor(index / 12);
    const month = ((index % 12) + 12) % 12;
    return {
      key: `${String(year)}-${String(month)}`,
      title: new Intl.DateTimeFormat(locale.value, {
        timeZone: 'UTC',
        month: 'long',
        year: 'numeric',
      }).format(new Date(Date.UTC(year, month, 1))),
      cells: playtimeMonthCells(year, month),
    };
  }),
);
const weekdays = computed(() =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale.value, { timeZone: 'UTC', weekday: 'narrow' }).format(
      new Date(Date.UTC(2024, 0, 1 + i)),
    ),
  ),
);

function closureOn(iso: string) {
  return closures.value.find((c) => iso >= c.startsOn && iso <= c.endsOn);
}
const picking = ref<string | null>(null);
function pick(iso: string) {
  const anchor = picking.value ?? iso;
  from.value = anchor < iso ? anchor : iso;
  to.value = anchor < iso ? iso : anchor;
}
function onDown(event: PointerEvent) {
  const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-day]');
  if (!cell?.dataset.day) return;
  picking.value = cell.dataset.day;
  pick(cell.dataset.day);
  event.preventDefault();
}
function onMove(event: PointerEvent) {
  if (!picking.value) return;
  const cell = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>('[data-day]');
  if (cell?.dataset.day) pick(cell.dataset.day);
}
const onUp = () => (picking.value = null);
const picked = (iso: string) => !!from.value && !!to.value && iso >= from.value && iso <= to.value;
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.playtime.loadFailed')"
  />

  <div v-else class="flex max-w-4xl flex-col gap-6">
    <section class="flex flex-col gap-2 rounded-lg bg-elevated p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-col gap-1">
          <h2 class="text-xl">{{ t('admin.playtime.closures.title') }}</h2>
          <p class="max-w-prose text-muted">{{ t('admin.playtime.closures.lede') }}</p>
        </div>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-calendar-off"
          :loading="busy"
          :disabled="weekSkipped"
          :label="
            weekSkipped
              ? t('admin.playtime.closures.weekSkipped')
              : t('admin.playtime.closures.skip')
          "
          @click="skip"
        />
      </div>

      <p v-if="!sorted.length" class="py-4 text-muted">{{ t('admin.playtime.closures.empty') }}</p>
      <ul v-else class="flex flex-col">
        <li
          v-for="c in sorted"
          :key="c.id"
          class="grid items-center gap-x-4 gap-y-1 border-t border-default py-3 first:border-t-0 sm:grid-cols-4"
        >
          <div class="min-w-0">
            <span class="font-medium text-highlighted">{{ c.label }}</span>
            <span v-if="c.createdByName && !c.event" class="ml-2 text-sm text-muted">
              {{ t('admin.playtime.closures.by', { name: c.createdByName }) }}
            </span>
          </div>
          <span class="tabular-nums">{{ range(c) }}</span>
          <div class="flex flex-wrap gap-1.5">
            <UBadge color="neutral" variant="subtle" :label="who(c)" />
            <UBadge
              v-if="c.event"
              color="neutral"
              variant="outline"
              :label="t(`admin.playtime.closures.event.${c.event.scope}`, { name: c.event.name })"
            />
          </div>
          <div class="flex items-center gap-2">
            <UBadge
              :color="status(c) === 'active' ? 'success' : 'neutral'"
              variant="subtle"
              :label="t(`admin.playtime.closures.status.${status(c)}`)"
            />
            <UButton
              v-if="c.event"
              size="md"
              color="neutral"
              variant="ghost"
              :to="`/admin/events/${c.event.id}`"
              :label="t('admin.playtime.closures.openEvent')"
            />
            <UButton
              v-else
              size="md"
              color="error"
              variant="outline"
              :label="t('admin.playtime.closures.delete')"
              :aria-label="t('admin.playtime.closures.deleteAria', { label: c.label })"
              @click="remove(c)"
            />
          </div>
        </li>
      </ul>
    </section>

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <div class="flex flex-col gap-1">
        <h2 class="text-xl">{{ t('admin.playtime.closures.add') }}</h2>
        <p class="text-muted">{{ t('admin.playtime.closures.addLede') }}</p>
      </div>
      <div class="grid gap-6 lg:grid-cols-2">
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <UButton
              size="md"
              color="neutral"
              variant="ghost"
              icon="i-lucide-chevron-left"
              :aria-label="t('admin.playtime.closures.earlier')"
              @click="offset -= 1"
            />
            <UButton
              v-if="offset !== 0"
              size="md"
              color="neutral"
              variant="ghost"
              :label="t('admin.playtime.closures.thisMonth')"
              @click="offset = 0"
            />
            <UButton
              size="md"
              color="neutral"
              variant="ghost"
              icon="i-lucide-chevron-right"
              :aria-label="t('admin.playtime.closures.later')"
              @click="offset += 1"
            />
          </div>
          <div
            class="grid touch-none gap-5 select-none sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3"
            @pointerdown="onDown"
            @pointermove="onMove"
            @pointerup="onUp"
            @pointercancel="onUp"
          >
            <div v-for="m in months" :key="m.key" class="flex flex-col gap-2">
              <h3 class="text-sm font-medium text-highlighted capitalize">{{ m.title }}</h3>
              <div class="grid grid-cols-7 gap-0.5 text-center text-sm">
                <span v-for="(w, i) in weekdays" :key="i" class="pb-1 text-xs text-muted">{{
                  w
                }}</span>
                <template v-for="(cell, i) in m.cells" :key="i">
                  <span v-if="!cell" />
                  <span
                    v-else
                    :data-day="cell"
                    class="cursor-pointer rounded-xs py-1.5 tabular-nums"
                    :class="[
                      picked(cell)
                        ? 'bg-secondary/15 ring-1 ring-secondary ring-inset'
                        : closureOn(cell)?.tenantIds
                          ? 'bg-secondary/15 text-muted'
                          : closureOn(cell)
                            ? 'bg-accented text-muted'
                            : 'bg-default',
                      cell === today ? 'font-bold underline underline-offset-2' : '',
                    ]"
                  >
                    {{ Number(cell.slice(8)) }}
                  </span>
                </template>
              </div>
            </div>
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span class="flex items-center gap-1.5"
              ><i class="size-3 rounded-xs bg-accented" />{{
                t('admin.playtime.closures.keyAll')
              }}</span
            >
            <span class="flex items-center gap-1.5"
              ><i class="size-3 rounded-xs bg-secondary/15" />{{
                t('admin.playtime.closures.keySchools')
              }}</span
            >
          </div>
        </div>

        <UForm :state="{}" class="flex flex-col gap-4" @submit="add">
          <UFormField :label="t('admin.playtime.closures.label')">
            <UInput
              v-model="label"
              :maxlength="120"
              class="w-full"
              :placeholder="t('admin.playtime.closures.labelPlaceholder')"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField :label="t('admin.playtime.closures.from')">
              <UInput v-model="from" type="date" class="w-full" />
            </UFormField>
            <UFormField :label="t('admin.playtime.closures.to')">
              <UInput v-model="to" type="date" class="w-full" />
            </UFormField>
          </div>
          <fieldset class="flex flex-col gap-2">
            <legend class="mb-1 text-sm font-medium">{{ t('admin.playtime.closures.who') }}</legend>
            <div class="flex flex-wrap gap-2">
              <UButton
                type="button"
                size="md"
                color="neutral"
                :variant="scope === 'all' ? 'soft' : 'outline'"
                :aria-pressed="scope === 'all'"
                :label="t('admin.playtime.closures.everyone')"
                @click="scope = 'all'"
              />
              <UButton
                type="button"
                size="md"
                color="neutral"
                :variant="scope === 'schools' ? 'soft' : 'outline'"
                :aria-pressed="scope === 'schools'"
                :label="t('admin.playtime.closures.someSchools')"
                @click="scope = 'schools'"
              />
            </div>
            <UCheckboxGroup v-if="scope === 'schools'" v-model="tenantIds" :items="schoolItems" />
          </fieldset>
          <div class="flex items-center gap-3">
            <UButton
              type="submit"
              :loading="busy"
              :disabled="!formValid"
              :label="t('admin.playtime.closures.addButton')"
            />
            <span v-if="!from || !to" class="text-sm text-muted">{{
              t('admin.playtime.closures.pickDates')
            }}</span>
          </div>
        </UForm>
      </div>
    </section>
  </div>
</template>
