<script setup lang="ts">
import type {
  PlaytimeSchedule,
  PlaytimeSchoolBody,
  PlaytimeSettingsResponse,
} from '#shared/schemas/playtime';

// One school's overrides. Each setting is inherited until its switch is on, and a schedule replaces
// the global one as a whole. Closes with the body to save, 'clear' to follow the global rules
// again, or null.
const props = defineProps<{
  school: PlaytimeSettingsResponse['schools'][number];
  global: PlaytimeSettingsResponse;
}>();
const emit = defineEmits<{ close: [result: PlaytimeSchoolBody | 'clear' | null] }>();

const { t, n: num } = useI18n();
const own = props.school.overrides;

const allowance = ref<number | null>(
  own.allowanceSeconds === null ? null : own.allowanceSeconds / 3600,
);
const grace = ref<number | null>(own.graceSeconds === null ? null : own.graceSeconds / 60);
const warnings = ref<string | null>(
  own.warningsMinutes === null ? null : formatPlaytimeMinutes(own.warningsMinutes),
);
const startWarnings = ref<string | null>(
  own.startWarningsMinutes === null ? null : formatPlaytimeMinutes(own.startWarningsMinutes),
);
const schedule = ref<PlaytimeSchedule | null>(
  own.schedule ? structuredClone(toRaw(own.schedule)) : null,
);

const hasOverrides = computed(() => Object.values(own).some((value) => value !== null));
const warningsValue = computed(() =>
  warnings.value === null ? null : parsePlaytimeMinutes(warnings.value),
);
const startValue = computed(() =>
  startWarnings.value === null ? null : parsePlaytimeMinutes(startWarnings.value),
);
const valid = computed(
  () =>
    (warnings.value === null || warningsValue.value !== null) &&
    (startWarnings.value === null || startValue.value !== null) &&
    (allowance.value === null || (allowance.value >= 0 && allowance.value <= 168)) &&
    (grace.value === null || (grace.value >= 0 && grace.value <= 1440)),
);

const on = (value: boolean | 'indeterminate') => value === true;
function setAllowance(value: boolean | 'indeterminate') {
  allowance.value = on(value) ? props.global.allowanceSeconds / 3600 : null;
}
function setGrace(value: boolean | 'indeterminate') {
  grace.value = on(value) ? props.global.graceSeconds / 60 : null;
}
function setWarnings(value: boolean | 'indeterminate') {
  warnings.value = on(value) ? formatPlaytimeMinutes(props.global.warningsMinutes) : null;
}
function setStartWarnings(value: boolean | 'indeterminate') {
  startWarnings.value = on(value) ? formatPlaytimeMinutes(props.global.startWarningsMinutes) : null;
}
function setSchedule(value: boolean | 'indeterminate') {
  schedule.value = on(value) ? structuredClone(toRaw(props.global.schedule)) : null;
}

function save() {
  if (!valid.value) return;
  emit('close', {
    allowanceSeconds: allowance.value === null ? null : Math.round(allowance.value * 3600),
    graceSeconds: grace.value === null ? null : Math.round(grace.value * 60),
    warningsMinutes: warningsValue.value,
    startWarningsMinutes: startValue.value,
    schedule: schedule.value,
  });
}
</script>

<template>
  <UModal
    :title="t('admin.playtime.school.title', { name: school.name })"
    :description="t('admin.playtime.school.lede')"
    :close="false"
    :ui="{ content: 'max-w-4xl' }"
  >
    <template #body>
      <form id="playtime-school" class="flex flex-col gap-6" @submit.prevent="save">
        <div class="grid gap-5 sm:grid-cols-2">
          <div class="flex flex-col gap-2">
            <USwitch
              :model-value="allowance !== null"
              :label="t('admin.playtime.school.allowance')"
              @update:model-value="setAllowance"
            />
            <UInputNumber
              v-if="allowance !== null"
              v-model="allowance"
              :min="0"
              :max="168"
              :step="0.5"
            />
            <span v-else class="text-sm text-muted">
              {{
                t('admin.playtime.school.inherits', {
                  value: t('admin.playtime.hours', { n: num(global.allowanceSeconds / 3600) }),
                })
              }}
            </span>
          </div>
          <div class="flex flex-col gap-2">
            <USwitch
              :model-value="grace !== null"
              :label="t('admin.playtime.school.grace')"
              @update:model-value="setGrace"
            />
            <UInputNumber v-if="grace !== null" v-model="grace" :min="0" :max="1440" />
            <span v-else class="text-sm text-muted">
              {{
                t('admin.playtime.school.inherits', {
                  value: t('admin.playtime.minutes', { n: num(global.graceSeconds / 60) }),
                })
              }}
            </span>
          </div>
          <div class="flex flex-col gap-2">
            <USwitch
              :model-value="warnings !== null"
              :label="t('admin.playtime.school.warnings')"
              @update:model-value="setWarnings"
            />
            <UInput
              v-if="warnings !== null"
              v-model="warnings"
              :color="warningsValue ? undefined : 'error'"
            />
            <span v-else class="text-sm text-muted">
              {{
                t('admin.playtime.school.inherits', {
                  value: formatPlaytimeMinutes(global.warningsMinutes) || t('admin.playtime.none'),
                })
              }}
            </span>
          </div>
          <div class="flex flex-col gap-2">
            <USwitch
              :model-value="startWarnings !== null"
              :label="t('admin.playtime.school.startWarnings')"
              @update:model-value="setStartWarnings"
            />
            <UInput
              v-if="startWarnings !== null"
              v-model="startWarnings"
              :color="startValue ? undefined : 'error'"
            />
            <span v-else class="text-sm text-muted">
              {{
                t('admin.playtime.school.inherits', {
                  value:
                    formatPlaytimeMinutes(global.startWarningsMinutes) || t('admin.playtime.none'),
                })
              }}
            </span>
          </div>
        </div>
        <div class="flex flex-col gap-3">
          <USwitch
            :model-value="schedule !== null"
            :label="t('admin.playtime.school.schedule')"
            :description="t('admin.playtime.school.scheduleHint')"
            @update:model-value="setSchedule"
          />
          <AdminPlaytimeSchedule v-if="schedule" v-model="schedule" />
        </div>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-3">
        <UButton
          v-if="hasOverrides"
          color="neutral"
          variant="outline"
          :label="t('admin.playtime.school.clear')"
          @click="emit('close', 'clear')"
        />
        <span v-else />
        <div class="flex gap-3">
          <UButton
            color="neutral"
            variant="soft"
            :label="t('admin.cancel')"
            @click="emit('close', null)"
          />
          <UButton
            type="submit"
            form="playtime-school"
            :disabled="!valid"
            :label="t('admin.playtime.save')"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
