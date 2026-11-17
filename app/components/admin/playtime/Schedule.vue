<script setup lang="ts">
import type { PlaytimeSchedule } from '#shared/schemas/playtime';
import { timeToMinutes } from '#shared/schemas/playtime';
import { WEEKDAYS } from '#shared/utils/paris-time';

// The editor for restricted hours: one 24-hour line per weekday. Drag on an empty line to draw a
// range, drag a range to move it, drag its edges to resize (15 minute steps). A click selects a
// range or a day, and the bar under the lines edits exact times. The model is committed when a
// gesture ends, never in the middle of one.
const model = defineModel<PlaytimeSchedule>({ required: true });
const { t } = useI18n();

type Day = (typeof WEEKDAYS)[number];
type Range = [number, number];
type Week = Record<Day, Range[]>;

const STEP = 15;
const DAY_MINUTES = 1440;
const MAX_RANGES = 8;
const HOURS = Array.from({ length: 12 }, (_, i) => i * 2);

const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const snap = (minutes: number) =>
  Math.max(0, Math.min(DAY_MINUTES, Math.round(minutes / STEP) * STEP));

function read(schedule: PlaytimeSchedule): Week {
  return Object.fromEntries(
    WEEKDAYS.map((day) => [
      day,
      schedule[day].map(([from, to]) => [timeToMinutes(from), timeToMinutes(to)] as Range),
    ]),
  ) as Week;
}
function merged(ranges: Range[]): Range[] {
  const out: Range[] = [];
  for (const range of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = out.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else out.push([...range]);
  }
  return out;
}

const week = ref<Week>(read(model.value));
watch(model, (schedule) => (week.value = read(schedule)));

/** The day and range being edited. A null range is a day with nothing selected in it. */
const selected = ref<{ day: Day; index: number | null } | null>(null);
const range = computed(() =>
  selected.value && selected.value.index !== null
    ? week.value[selected.value.day][selected.value.index]
    : undefined,
);

function commit() {
  const current = range.value;
  for (const day of WEEKDAYS) week.value[day] = merged(week.value[day]);
  if (selected.value && current) {
    const index = week.value[selected.value.day].findIndex(
      (r) => r[0] <= current[0] && r[1] >= current[1],
    );
    selected.value = { day: selected.value.day, index: index < 0 ? null : index };
  }
  model.value = Object.fromEntries(
    WEEKDAYS.map((day) => [
      day,
      week.value[day].map(([from, to]) => [toTime(from), toTime(to)] as [string, string]),
    ]),
  ) as PlaytimeSchedule;
}

const dayMinutes = (day: Day) => week.value[day].reduce((sum, [from, to]) => sum + to - from, 0);
const total = computed(() => WEEKDAYS.reduce((sum, day) => sum + dayMinutes(day), 0));
function hours(minutes: number) {
  const rest = minutes % 60;
  return `${String(Math.floor(minutes / 60))} h${rest ? String(rest).padStart(2, '0') : ''}`;
}

// Drawing, moving and resizing, with the pointer captured by the line so a drag can leave it.
interface Drag {
  kind: 'new' | 'move' | 'left' | 'right';
  day: Day;
  index: number;
  origin: Range;
  start: number;
  moved: boolean;
}
let drag: Drag | null = null;
const hover = ref<{ day: Day; left: number; label: string } | null>(null);

function minutesAt(event: PointerEvent, track: HTMLElement) {
  const box = track.getBoundingClientRect();
  return Math.max(0, Math.min(DAY_MINUTES, ((event.clientX - box.left) / box.width) * DAY_MINUTES));
}

function onDown(event: PointerEvent, day: Day) {
  const track = event.currentTarget as HTMLElement;
  const at = minutesAt(event, track);
  const element = (event.target as HTMLElement).closest<HTMLElement>('[data-range]');
  hover.value = null;
  track.setPointerCapture(event.pointerId);
  if (element) {
    const index = Number(element.dataset.range);
    const handle = (event.target as HTMLElement).dataset.handle;
    drag = {
      kind: handle === 'left' ? 'left' : handle === 'right' ? 'right' : 'move',
      day,
      index,
      origin: [...week.value[day][index]!] as Range,
      start: at,
      moved: false,
    };
    selected.value = { day, index };
  } else {
    if (week.value[day].length >= MAX_RANGES) return;
    const from = snap(at);
    week.value[day].push([from, from]);
    drag = {
      kind: 'new',
      day,
      index: week.value[day].length - 1,
      origin: [from, from],
      start: at,
      moved: false,
    };
    selected.value = { day, index: null };
  }
  event.preventDefault();
}

function onMove(event: PointerEvent, day: Day) {
  const track = event.currentTarget as HTMLElement;
  const at = minutesAt(event, track);
  if (!drag || drag.day !== day) {
    const box = track.getBoundingClientRect();
    hover.value = {
      day,
      left: event.clientX - box.left,
      label: toTime(Math.min(snap(at), DAY_MINUTES - STEP)),
    };
    return;
  }
  const current = week.value[day][drag.index];
  if (!current) return;
  drag.moved = true;
  if (drag.kind === 'new') {
    const to = snap(at);
    const from = drag.origin[0];
    current[0] = Math.min(from, to);
    current[1] = Math.max(from, to);
  } else if (drag.kind === 'left') {
    current[0] = Math.min(snap(at), drag.origin[1] - STEP);
  } else if (drag.kind === 'right') {
    current[1] = Math.max(snap(at), drag.origin[0] + STEP);
  } else {
    const length = drag.origin[1] - drag.origin[0];
    const from = Math.max(
      0,
      Math.min(DAY_MINUTES - length, snap(drag.origin[0] + at - drag.start)),
    );
    current[0] = from;
    current[1] = from + length;
  }
}

function onUp() {
  if (!drag) return;
  const finished = drag;
  drag = null;
  const current = week.value[finished.day][finished.index];
  if (finished.kind === 'new') {
    if (!current || current[1] - current[0] < STEP) {
      week.value[finished.day].splice(finished.index, 1);
      return;
    }
    selected.value = { day: finished.day, index: finished.index };
  }
  if (finished.moved) commit();
}

function onKey(event: KeyboardEvent, day: Day, index: number) {
  const current = week.value[day][index];
  if (!current) return;
  if (event.key === 'Delete' || event.key === 'Backspace') {
    week.value[day].splice(index, 1);
    selected.value = { day, index: null };
    commit();
    event.preventDefault();
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    selected.value = { day, index };
    event.preventDefault();
    return;
  }
  const step = event.key === 'ArrowRight' ? STEP : event.key === 'ArrowLeft' ? -STEP : 0;
  if (!step) return;
  event.preventDefault();
  if (event.shiftKey) {
    current[1] = Math.max(current[0] + STEP, Math.min(DAY_MINUTES, current[1] + step));
  } else {
    const length = current[1] - current[0];
    const from = Math.max(0, Math.min(DAY_MINUTES - length, current[0] + step));
    current[0] = from;
    current[1] = from + length;
  }
  selected.value = { day, index };
  commit();
  void nextTick(() => {
    const index = selected.value?.index;
    if (index != null) document.getElementById(`pt-range-${day}-${String(index)}`)?.focus();
  });
}

function addRange(day: Day) {
  if (week.value[day].length >= MAX_RANGES) return;
  const free = (
    [
      [540, 1020],
      [1080, 1200],
      [0, 120],
      [1200, 1320],
    ] as Range[]
  ).find((c) => !week.value[day].some((r) => c[0] < r[1] && c[1] > r[0]));
  const added: Range = free ? [...free] : [0, 60];
  week.value[day].push(added);
  selected.value = { day, index: null };
  const current = added;
  commit();
  selected.value = {
    day,
    index: week.value[day].findIndex((r) => r[0] <= current[0] && r[1] >= current[1]),
  };
}

function setTime(which: 0 | 1, value: string) {
  const current = range.value;
  if (!current || !/^\d\d:\d\d$/.test(value)) return;
  const minutes = timeToMinutes(value);
  const next: Range = which === 0 ? [minutes, current[1]] : [current[0], minutes];
  if (next[1] <= next[0]) return;
  current[0] = next[0];
  current[1] = next[1];
  commit();
}

function removeRange() {
  if (!selected.value || selected.value.index === null) return;
  week.value[selected.value.day].splice(selected.value.index, 1);
  selected.value = { day: selected.value.day, index: null };
  commit();
}

function copyDay(targets: readonly Day[]) {
  if (!selected.value) return;
  const source = week.value[selected.value.day];
  for (const day of targets) {
    if (day !== selected.value.day) week.value[day] = source.map((r) => [...r] as Range);
  }
  commit();
}

const WORKDAYS = WEEKDAYS.slice(0, 5);
function preset(kind: 'workdays' | 'every' | 'clear') {
  for (const day of WEEKDAYS) {
    week.value[day] =
      kind === 'clear' || (kind === 'workdays' && !WORKDAYS.includes(day)) ? [] : [[540, 1020]];
  }
  selected.value = null;
  commit();
}

const detailFrom = computed(() => (range.value ? toTime(range.value[0]) : ''));
const detailTo = computed(() => (range.value ? toTime(range.value[1]) : ''));
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm text-muted">{{ t('admin.playtime.schedule.start') }}</span>
      <UButton
        size="md"
        color="neutral"
        variant="soft"
        :label="t('admin.playtime.schedule.presets.workdays')"
        @click="preset('workdays')"
      />
      <UButton
        size="md"
        color="neutral"
        variant="soft"
        :label="t('admin.playtime.schedule.presets.every')"
        @click="preset('every')"
      />
      <UButton
        size="md"
        color="neutral"
        variant="ghost"
        :label="t('admin.playtime.schedule.presets.clear')"
        @click="preset('clear')"
      />
      <span class="ml-auto text-sm text-muted tabular-nums">
        {{ t('admin.playtime.schedule.total', { hours: hours(total) }) }}
      </span>
    </div>

    <div class="flex flex-col gap-2">
      <div class="flex gap-x-3">
        <span class="w-12 shrink-0" />
        <div
          class="grid min-w-0 flex-1 grid-cols-12 text-xs text-muted tabular-nums"
          aria-hidden="true"
        >
          <span v-for="hour in HOURS" :key="hour">{{ String(hour).padStart(2, '0') }}</span>
        </div>
        <span class="w-14 shrink-0" />
        <span class="w-8 shrink-0" />
      </div>

      <div v-for="day in WEEKDAYS" :key="day" class="flex items-center gap-x-3">
        <button
          type="button"
          class="w-12 shrink-0 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary"
          :class="selected?.day === day ? 'text-secondary underline underline-offset-4' : ''"
          :aria-label="
            t('admin.playtime.schedule.selectDay', { day: t(`admin.playtime.days.${day}`) })
          "
          @click="selected = { day, index: week[day].length ? 0 : null }"
        >
          {{ t(`admin.playtime.daysShort.${day}`) }}
        </button>

        <div class="relative min-w-0 flex-1">
          <span
            v-if="hover?.day === day"
            class="pointer-events-none absolute -top-6 z-10 -translate-x-1/2 rounded-sm bg-inverted px-1.5 text-xs font-medium text-inverted tabular-nums"
            :style="{ left: `${hover.left}px` }"
          >
            {{ hover.label }}
          </span>
          <div
            class="relative h-9 touch-none rounded-sm bg-default"
            @pointerdown="onDown($event, day)"
            @pointermove="onMove($event, day)"
            @pointerup="onUp"
            @pointercancel="onUp"
            @pointerleave="hover = null"
          >
            <div
              v-for="(r, index) in week[day]"
              :id="`pt-range-${day}-${String(index)}`"
              :key="index"
              :data-range="index"
              role="button"
              tabindex="0"
              :aria-label="
                t('admin.playtime.schedule.rangeLabel', {
                  day: t(`admin.playtime.days.${day}`),
                  from: toTime(r[0]),
                  to: toTime(r[1]),
                })
              "
              class="absolute inset-y-0 flex cursor-grab items-center justify-center overflow-hidden rounded-sm px-3 text-xs font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing"
              :class="
                selected?.day === day && selected.index === index
                  ? 'bg-secondary/15 ring-2 ring-secondary ring-inset'
                  : 'bg-accented'
              "
              :style="{
                left: `${(r[0] / DAY_MINUTES) * 100}%`,
                width: `${((r[1] - r[0]) / DAY_MINUTES) * 100}%`,
              }"
              @keydown="onKey($event, day, index)"
            >
              <span
                data-handle="left"
                class="absolute inset-y-0 left-0 flex w-3 cursor-ew-resize items-center justify-center after:h-3.5 after:w-0.5 after:rounded-full after:bg-muted"
              />
              <template v-if="r[1] - r[0] >= 90">{{ toTime(r[0]) }}–{{ toTime(r[1]) }}</template>
              <span
                data-handle="right"
                class="absolute inset-y-0 right-0 flex w-3 cursor-ew-resize items-center justify-center after:h-3.5 after:w-0.5 after:rounded-full after:bg-muted"
              />
            </div>
          </div>
        </div>

        <span class="w-14 shrink-0 text-right text-sm text-muted tabular-nums">
          {{ dayMinutes(day) ? hours(dayMinutes(day)) : t('admin.playtime.schedule.free') }}
        </span>
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          icon="i-lucide-plus"
          square
          class="shrink-0 rounded-full"
          :disabled="week[day].length >= MAX_RANGES"
          :aria-label="
            t('admin.playtime.schedule.addRangeOn', { day: t(`admin.playtime.days.${day}`) })
          "
          @click="addRange(day)"
        />
      </div>
    </div>

    <div class="flex min-h-15 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-accented p-3">
      <template v-if="selected">
        <span class="font-medium">{{ t(`admin.playtime.days.${selected.day}`) }}</span>
        <template v-if="range">
          <label class="flex items-center gap-2 text-sm">
            {{ t('admin.playtime.schedule.from') }}
            <UInput
              type="time"
              :step="900"
              size="md"
              :model-value="detailFrom"
              @change="setTime(0, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="flex items-center gap-2 text-sm">
            {{ t('admin.playtime.schedule.to') }}
            <UInput
              type="time"
              :step="900"
              size="md"
              :model-value="detailTo"
              @change="setTime(1, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <span class="text-sm text-muted tabular-nums">{{ hours(range[1] - range[0]) }}</span>
        </template>
        <span v-else class="text-sm text-muted">
          {{
            week[selected.day].length
              ? t('admin.playtime.schedule.pickRange')
              : t('admin.playtime.schedule.emptyDay')
          }}
        </span>
        <span class="flex-1" />
        <UButton
          v-if="!range"
          size="md"
          color="neutral"
          variant="soft"
          icon="i-lucide-plus"
          :label="t('admin.playtime.schedule.addRange')"
          :disabled="week[selected.day].length >= MAX_RANGES"
          @click="addRange(selected.day)"
        />
        <span class="text-sm text-muted">{{ t('admin.playtime.schedule.copyTo') }}</span>
        <UButton
          size="md"
          color="neutral"
          variant="soft"
          :label="t('admin.playtime.schedule.copyWorkdays')"
          @click="copyDay(WORKDAYS)"
        />
        <UButton
          size="md"
          color="neutral"
          variant="soft"
          :label="t('admin.playtime.schedule.copyAll')"
          @click="copyDay(WEEKDAYS)"
        />
        <UButton
          v-if="range"
          size="md"
          color="error"
          variant="outline"
          :label="t('admin.playtime.schedule.removeRange')"
          @click="removeRange"
        />
      </template>
      <span v-else class="text-sm text-muted">{{ t('admin.playtime.schedule.hint') }}</span>
    </div>
    <p class="text-sm text-muted">{{ t('admin.playtime.schedule.help') }}</p>
  </div>
</template>
