<script setup lang="ts">
import { AdminPlaytimeSchoolModal, AdminTypedConfirmModal, WardenConfirmModal } from '#components';

import type {
  PlaytimeMode,
  PlaytimeSchedule,
  PlaytimeSchoolBody,
  PlaytimeSettingsResponse,
} from '#shared/schemas/playtime';
import {
  PLAYTIME_MODES,
  PLAYTIME_RESET_ALL_CONFIRM,
  PLAYTIME_RESET_CONFIRM,
} from '#shared/schemas/playtime';

// The Rules tab: the mode, the defaults for everyone, the restricted hours and the schools. A mode
// card saves at once (and asks before `enforce`). The defaults and the schedule save on their own.
const { t, n: num } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const { user } = useAuth();

const { data, error, refresh } = await usePlaytimeSettings();

const allowance = ref(0);
const grace = ref(0);
const warnings = ref('');
const startWarnings = ref('');
const schedule = ref<PlaytimeSchedule | null>(null);

function load(settings: PlaytimeSettingsResponse) {
  allowance.value = settings.allowanceSeconds / 3600;
  grace.value = settings.graceSeconds / 60;
  warnings.value = formatPlaytimeMinutes(settings.warningsMinutes);
  startWarnings.value = formatPlaytimeMinutes(settings.startWarningsMinutes);
  schedule.value = structuredClone(toRaw(settings.schedule));
}
if (data.value) load(data.value);
watch(data, (settings) => {
  if (settings) load(settings);
});

const warningsParsed = computed(() => parsePlaytimeMinutes(warnings.value));
const startParsed = computed(() => parsePlaytimeMinutes(startWarnings.value));
const defaultsValid = computed(
  () =>
    allowance.value >= 0 &&
    allowance.value <= 168 &&
    grace.value >= 0 &&
    grace.value <= 1440 &&
    warningsParsed.value !== null &&
    startParsed.value !== null,
);
const defaultsChanged = computed(
  () =>
    !!data.value &&
    (Math.round(allowance.value * 3600) !== data.value.allowanceSeconds ||
      Math.round(grace.value * 60) !== data.value.graceSeconds ||
      JSON.stringify(warningsParsed.value) !== JSON.stringify(data.value.warningsMinutes) ||
      JSON.stringify(startParsed.value) !== JSON.stringify(data.value.startWarningsMinutes)),
);
const scheduleChanged = computed(
  () => !!data.value && JSON.stringify(schedule.value) !== JSON.stringify(data.value.schedule),
);

function done(title: string) {
  toast.add({ title, color: 'success', icon: 'i-lucide-circle-check' });
}
function fail() {
  toast.add({
    title: t('admin.playtime.errors.failed'),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

// Site admins only: the counted time and the warnings, wiped for everyone.
async function resetCounters() {
  const reset: unknown = await overlay.create(AdminTypedConfirmModal).open({
    title: t('admin.playtime.reset.title'),
    description: t('admin.playtime.reset.warning'),
    sentence: PLAYTIME_RESET_CONFIRM,
    confirmLabel: t('admin.playtime.reset.confirm'),
    run: () => playtimeAdminActions.reset(PLAYTIME_RESET_CONFIRM),
  }).result;
  if (reset === true) done(t('admin.playtime.reset.done'));
}

// Site admins only: also the sessions and the total played time, wiped for everyone.
async function resetAll() {
  const reset: unknown = await overlay.create(AdminTypedConfirmModal).open({
    title: t('admin.playtime.reset.all.title'),
    description: t('admin.playtime.reset.all.warning'),
    sentence: PLAYTIME_RESET_ALL_CONFIRM,
    confirmLabel: t('admin.playtime.reset.all.confirm'),
    run: () => playtimeAdminActions.resetAll(PLAYTIME_RESET_ALL_CONFIRM),
  }).result;
  if (reset === true) done(t('admin.playtime.reset.all.done'));
}

const pendingMode = ref<PlaytimeMode | null>(null);
async function pickMode(mode: PlaytimeMode) {
  if (!data.value || mode === data.value.mode || pendingMode.value) return;
  if (mode === 'enforce') {
    const confirmed: unknown = await overlay.create(WardenConfirmModal).open({
      title: t('admin.playtime.mode.enforceTitle'),
      description: t('admin.playtime.mode.enforceBody'),
      confirmLabel: t('admin.playtime.mode.enforceConfirm'),
      cancelLabel: t('admin.cancel'),
      destructive: false,
    }).result;
    if (confirmed !== true) return;
  }
  pendingMode.value = mode;
  try {
    data.value = await playtimeAdminActions.saveSettings({ mode });
    done(t('admin.playtime.mode.done', { mode: t(`admin.playtime.mode.${mode}.label`) }));
  } catch {
    fail();
    await refresh();
  } finally {
    pendingMode.value = null;
  }
}

const saving = ref<'defaults' | 'schedule' | null>(null);
async function saveDefaults() {
  if (!defaultsValid.value || saving.value || !warningsParsed.value || !startParsed.value) return;
  saving.value = 'defaults';
  try {
    data.value = await playtimeAdminActions.saveSettings({
      allowanceSeconds: Math.round(allowance.value * 3600),
      graceSeconds: Math.round(grace.value * 60),
      warningsMinutes: warningsParsed.value,
      startWarningsMinutes: startParsed.value,
    });
    done(t('admin.playtime.saved'));
  } catch {
    fail();
  } finally {
    saving.value = null;
  }
}
async function saveSchedule() {
  if (!schedule.value || saving.value) return;
  saving.value = 'schedule';
  try {
    data.value = await playtimeAdminActions.saveSettings({ schedule: schedule.value });
    done(t('admin.playtime.saved'));
  } catch {
    fail();
  } finally {
    saving.value = null;
  }
}

async function editSchool(school: PlaytimeSettingsResponse['schools'][number]) {
  if (!data.value) return;
  const closed: unknown = await overlay
    .create(AdminPlaytimeSchoolModal)
    .open({ school, global: data.value }).result;
  if (!closed) return;
  const result = closed as PlaytimeSchoolBody | 'clear';
  try {
    data.value =
      result === 'clear'
        ? await playtimeAdminActions.clearSchool(school.tenantId)
        : await playtimeAdminActions.saveSchool(school.tenantId, result);
    done(t('admin.playtime.saved'));
  } catch {
    fail();
  }
}

const schoolOwn = (school: PlaytimeSettingsResponse['schools'][number]) =>
  Object.values(school.overrides).some((value) => value !== null);
const ownScheduleSchools = computed(() =>
  (data.value?.schools ?? []).filter((school) => school.overrides.schedule).map((s) => s.name),
);
const list = (names: string[]) =>
  new Intl.ListFormat(undefined, { type: 'conjunction' }).format(names);

/** "Mon–Thu 14:00–18:00" for a school's own schedule. */
function summarize(schedule: PlaytimeSchedule): string {
  const lines = new Map<string, string[]>();
  for (const day of WEEKDAYS) {
    const key = schedule[day].map(([a, b]) => `${a}–${b}`).join(', ');
    if (key) lines.set(key, [...(lines.get(key) ?? []), t(`admin.playtime.daysShort.${day}`)]);
  }
  return (
    [...lines]
      .map(
        ([ranges, days]) =>
          `${days.length > 1 ? `${days[0] ?? ''}–${days.at(-1) ?? ''}` : (days[0] ?? '')} ${ranges}`,
      )
      .join(' · ') || t('admin.playtime.none')
  );
}
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
    <UAlert
      v-if="!data.flagEnabled"
      color="warning"
      variant="subtle"
      icon="i-lucide-toggle-left"
      :title="t('admin.playtime.flagOff')"
      :description="t('admin.playtime.flagOffBody')"
    />

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <div class="flex flex-col gap-1">
        <h2 class="text-xl">{{ t('admin.playtime.mode.title') }}</h2>
        <p class="text-muted">{{ t('admin.playtime.mode.lede') }}</p>
      </div>
      <div
        role="radiogroup"
        :aria-label="t('admin.playtime.mode.title')"
        class="grid gap-3 sm:grid-cols-3"
      >
        <button
          v-for="mode in PLAYTIME_MODES"
          :key="mode"
          type="button"
          role="radio"
          :aria-checked="data.mode === mode"
          :disabled="pendingMode !== null"
          class="flex flex-col items-start gap-1 rounded-lg border-2 bg-default p-4 text-left focus-visible:outline-2 focus-visible:outline-primary"
          :class="data.mode === mode ? 'border-secondary bg-accented' : 'border-transparent'"
          @click="pickMode(mode)"
        >
          <span class="font-display text-base text-highlighted">
            {{ t(`admin.playtime.mode.${mode}.label`) }}
          </span>
          <span class="text-sm text-muted">{{ t(`admin.playtime.mode.${mode}.description`) }}</span>
          <span class="mt-2 text-sm text-muted">{{ t(`admin.playtime.mode.${mode}.hint`) }}</span>
        </button>
      </div>
    </section>

    <UForm
      :state="{}"
      class="flex flex-col gap-4 rounded-lg bg-elevated p-5"
      @submit="saveDefaults"
    >
      <div class="flex flex-col gap-1">
        <h2 class="text-xl">{{ t('admin.playtime.defaults.title') }}</h2>
        <p class="text-muted">{{ t('admin.playtime.defaults.lede') }}</p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          :label="t('admin.playtime.defaults.allowance')"
          :hint="t('admin.playtime.defaults.allowanceHint')"
        >
          <UInputNumber v-model="allowance" :min="0" :max="168" :step="0.5" class="w-40" />
        </UFormField>
        <UFormField
          :label="t('admin.playtime.defaults.grace')"
          :hint="t('admin.playtime.defaults.graceHint')"
        >
          <UInputNumber v-model="grace" :min="0" :max="1440" class="w-40" />
        </UFormField>
        <UFormField
          :label="t('admin.playtime.defaults.warnings')"
          :help="t('admin.playtime.defaults.warningsHint')"
          :error="warningsParsed ? undefined : t('admin.playtime.defaults.minutesInvalid')"
        >
          <UInput v-model="warnings" class="w-full" />
        </UFormField>
        <UFormField
          :label="t('admin.playtime.defaults.startWarnings')"
          :help="t('admin.playtime.defaults.startWarningsHint')"
          :error="startParsed ? undefined : t('admin.playtime.defaults.minutesInvalid')"
        >
          <UInput v-model="startWarnings" class="w-full" />
        </UFormField>
      </div>
      <div class="flex items-center gap-3">
        <UButton
          type="submit"
          :loading="saving === 'defaults'"
          :disabled="!defaultsValid || !defaultsChanged"
          :label="t('admin.playtime.save')"
        />
        <span class="text-sm text-muted">{{ t('admin.playtime.forwardOnly') }}</span>
      </div>
    </UForm>

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <div class="flex flex-col gap-1">
        <h2 class="text-xl">{{ t('admin.playtime.schedule.title') }}</h2>
        <p class="text-muted">{{ t('admin.playtime.schedule.lede') }}</p>
      </div>
      <AdminPlaytimeSchedule v-if="schedule" v-model="schedule" />
      <UAlert
        v-if="ownScheduleSchools.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        :description="
          t(
            'admin.playtime.schedule.schoolsKeep',
            { schools: list(ownScheduleSchools) },
            ownScheduleSchools.length,
          )
        "
      />
      <div class="flex items-center gap-3">
        <UButton
          :loading="saving === 'schedule'"
          :disabled="!scheduleChanged"
          :label="t('admin.playtime.schedule.save')"
          @click="saveSchedule"
        />
        <span class="text-sm text-muted">{{ t('admin.playtime.forwardOnly') }}</span>
      </div>
    </section>

    <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <div class="flex flex-col gap-1">
        <h2 class="text-xl">{{ t('admin.playtime.schools.title') }}</h2>
        <p class="text-muted">{{ t('admin.playtime.schools.lede') }}</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-xl border-collapse text-left">
          <thead class="text-sm text-muted">
            <tr>
              <th class="px-2 py-2 font-medium">{{ t('admin.playtime.schools.school') }}</th>
              <th class="px-2 py-2 font-medium">{{ t('admin.playtime.schools.allowance') }}</th>
              <th class="px-2 py-2 font-medium">{{ t('admin.playtime.schools.grace') }}</th>
              <th class="px-2 py-2 font-medium">{{ t('admin.playtime.schools.schedule') }}</th>
              <th class="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="school in data.schools"
              :key="school.tenantId"
              class="border-t border-default"
            >
              <td class="px-2 py-3 font-medium text-highlighted">{{ school.name }}</td>
              <td class="px-2 py-3 tabular-nums">
                <template v-if="school.overrides.allowanceSeconds !== null">
                  {{
                    t('admin.playtime.hours', { n: num(school.overrides.allowanceSeconds / 3600) })
                  }}
                </template>
                <span v-else class="text-muted">{{ t('admin.playtime.schools.default') }}</span>
              </td>
              <td class="px-2 py-3 tabular-nums">
                <template v-if="school.overrides.graceSeconds === 0">{{
                  t('admin.playtime.off')
                }}</template>
                <template v-else-if="school.overrides.graceSeconds !== null">
                  {{ t('admin.playtime.minutes', { n: num(school.overrides.graceSeconds / 60) }) }}
                </template>
                <span v-else class="text-muted">{{ t('admin.playtime.schools.default') }}</span>
              </td>
              <td class="px-2 py-3">
                <template v-if="school.overrides.schedule">
                  <UBadge
                    color="neutral"
                    variant="subtle"
                    :label="t('admin.playtime.schools.own')"
                  />
                  <span class="ml-2 text-sm text-muted tabular-nums">{{
                    summarize(school.overrides.schedule)
                  }}</span>
                </template>
                <span v-else class="text-muted">{{ t('admin.playtime.schools.default') }}</span>
              </td>
              <td class="px-2 py-3 text-right">
                <UButton
                  size="md"
                  color="neutral"
                  :variant="schoolOwn(school) ? 'soft' : 'outline'"
                  :label="t('admin.playtime.schools.edit')"
                  :aria-label="t('admin.playtime.schools.editAria', { name: school.name })"
                  @click="editSchool(school)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section
      v-if="isAdmin(user?.role)"
      class="flex flex-col items-start gap-3 rounded-lg bg-elevated p-6"
    >
      <h2 class="text-lg font-medium text-highlighted">{{ t('admin.playtime.reset.heading') }}</h2>
      <p class="text-muted">{{ t('admin.playtime.reset.lede') }}</p>
      <div class="flex flex-wrap gap-3">
        <UButton
          color="error"
          variant="outline"
          :label="t('admin.playtime.reset.open')"
          @click="resetCounters"
        />
        <UButton
          color="error"
          variant="outline"
          :label="t('admin.playtime.reset.all.open')"
          @click="resetAll"
        />
      </div>
    </section>
  </div>
</template>
