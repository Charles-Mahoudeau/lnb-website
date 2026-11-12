<script setup lang="ts">
import { WardenConfirmModal } from '#components';

import type {
  AnticheatAction,
  AnticheatMode,
  AnticheatProjectKind,
  AnticheatRules,
} from '#shared/schemas/anticheat';
import {
  ANTICHEAT_ACTIONS,
  ANTICHEAT_FILE_BANDS,
  ANTICHEAT_MODES,
  ANTICHEAT_PROJECT_KINDS,
  anticheatRules,
} from '#shared/schemas/anticheat';

// Mode, rules and mod-ID ban list. A mode card saves at once. The rules save together and create
// a new rules version. "Score everything again" asks first.
const { t, d } = useI18n();
const toast = useToast();
const overlay = useOverlay();

const { data, error, refresh } = await useAnticheatSettings();
const { data: bans, refresh: refreshBans } = await useAnticheatModIdBans();

type Section = 'criteria' | 'bands' | 'player' | 'lookup';
interface Field {
  section: Section;
  key: string;
  step?: number;
  max?: number;
}
const f = (section: Section, keys: string[]): Field[] => keys.map((key) => ({ section, key }));

const GROUPS: { id: string; fields: Field[] }[] = [
  {
    id: 'files',
    fields: [
      ...f('bands', ['accepted', 'middle']),
      ...f('criteria', [
        'moderationApproved',
        'downloadsHigh',
        'downloadsHighMin',
        'downloadsMid',
        'downloadsMidMin',
        'projectAge',
        'projectAgeDays',
        'versionAge',
        'versionAgeDays',
        'bothPlatforms',
        'identityMatch',
        'serverSide',
        'unknown',
        'suspectedModified',
      ]),
    ],
  },
  {
    id: 'resourcepacks',
    fields: f('criteria', ['texturesClean', 'noCoreShaders', 'texturesAltered', 'coreShaders']),
  },
  {
    id: 'player',
    fields: [
      ...f('player', [
        'start',
        'trusted',
        'held',
        'challengeWrong',
        'challengeMissed',
        'challengeMissedSessionCap',
        'modSetChanged',
        'channelMismatch',
        'modlistIncomplete',
        'playPerHour',
        'playDailyCap',
      ]),
      { section: 'player', key: 'adjustFactor', step: 0.05, max: 1 },
    ],
  },
  {
    id: 'lookups',
    fields: f('lookup', ['pendingTimeoutSeconds', 'notFoundRetryHours', 'rescoreDays']),
  },
];

const state = ref<AnticheatRules | null>(
  data.value ? structuredClone(toRaw(data.value.rules)) : null,
);
watch(data, (settings) => {
  if (settings) state.value = structuredClone(toRaw(settings.rules));
});

const read = (field: Field) =>
  (state.value?.[field.section] as Record<string, number> | undefined)?.[field.key];
function write(field: Field, value: number | undefined) {
  if (!state.value || value === undefined || Number.isNaN(value)) return;
  (state.value[field.section] as Record<string, number>)[field.key] = value;
}

const actionItems = computed(() =>
  ANTICHEAT_ACTIONS.map((value) => ({ label: t(`admin.anticheat.actions.${value}`), value })),
);
function readPolicy(kind: AnticheatProjectKind, band: (typeof ANTICHEAT_FILE_BANDS)[number]) {
  return state.value?.policy[kind][band];
}
function writePolicy(
  kind: AnticheatProjectKind,
  band: (typeof ANTICHEAT_FILE_BANDS)[number],
  value: AnticheatAction,
) {
  if (state.value) state.value.policy[kind][band] = value;
}

const pendingMode = ref<AnticheatMode | null>(null);
async function pickMode(mode: AnticheatMode) {
  if (!data.value || mode === data.value.mode || pendingMode.value) return;
  pendingMode.value = mode;
  try {
    data.value = await anticheatActions.saveSettings({ mode });
    toast.add({
      title: t('admin.anticheat.settings.modeDone', {
        mode: t(`admin.anticheat.settings.modes.${mode}.label`),
      }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await refreshNuxtData('anticheat-summary');
  } catch {
    fail('failed');
    await refresh();
  } finally {
    pendingMode.value = null;
  }
}

const saving = ref(false);
const valid = computed(() => !!state.value && anticheatRules.safeParse(state.value).success);
async function save() {
  if (!state.value || saving.value) return;
  saving.value = true;
  try {
    data.value = await anticheatActions.saveSettings({ rules: state.value });
    toast.add({
      title: t('admin.anticheat.settings.saved', { version: data.value.rulesVersion }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch {
    fail('failed');
  } finally {
    saving.value = false;
  }
}

const rescoring = ref(false);
async function rescore() {
  const confirmed: unknown = await overlay.create(WardenConfirmModal).open({
    title: t('admin.anticheat.settings.rescoreTitle'),
    description: t('admin.anticheat.settings.rescoreBody'),
    confirmLabel: t('admin.anticheat.settings.rescoreConfirm'),
    cancelLabel: t('admin.anticheat.cancel'),
    destructive: false,
  }).result;
  if (confirmed !== true) return;
  rescoring.value = true;
  try {
    const result = await anticheatActions.rescoreAll();
    toast.add({
      title: t('admin.anticheat.settings.rescored', result.files),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch {
    fail('failed');
  } finally {
    rescoring.value = false;
  }
}

const modId = ref('');
const modReason = ref('');
const banning = ref(false);
async function banModId() {
  if (!modId.value.trim() || !modReason.value.trim() || banning.value) return;
  banning.value = true;
  try {
    bans.value = await anticheatActions.banModId({
      modId: modId.value.trim(),
      reason: modReason.value.trim(),
    });
    modId.value = '';
    modReason.value = '';
    toast.add({
      title: t('admin.anticheat.settings.banned'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (failure) {
    fail(failure instanceof AnticheatError ? failure.problem : 'failed');
  } finally {
    banning.value = false;
  }
}
async function unban(id: string) {
  try {
    await anticheatActions.unbanModId(id);
    toast.add({
      title: t('admin.anticheat.settings.unbanned'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (failure) {
    fail(failure instanceof AnticheatError ? failure.problem : 'failed');
  }
  await refreshBans();
}

function fail(problem: string) {
  toast.add({
    title: t(`admin.anticheat.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}
const when = (iso: string) => d(iso, { dateStyle: 'medium', timeZone: 'Europe/Paris' });
</script>

<template>
  <UAlert
    v-if="error || !data || !state"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.anticheat.settings.loadFailed')"
  />

  <div v-else class="flex max-w-4xl flex-col gap-6">
    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <div class="flex flex-col gap-1">
        <h2 class="text-xl">{{ t('admin.anticheat.settings.mode') }}</h2>
        <p class="text-muted">{{ t('admin.anticheat.settings.modeLede') }}</p>
      </div>
      <div
        role="radiogroup"
        :aria-label="t('admin.anticheat.settings.mode')"
        class="grid gap-3 sm:grid-cols-3"
      >
        <button
          v-for="mode in ANTICHEAT_MODES"
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
            {{ t(`admin.anticheat.settings.modes.${mode}.label`) }}
          </span>
          <span class="text-sm text-muted">
            {{ t(`admin.anticheat.settings.modes.${mode}.description`) }}
          </span>
        </button>
      </div>
    </section>

    <UForm :schema="anticheatRules" :state="state" class="flex flex-col gap-6" @submit="save">
      <section class="flex flex-col gap-1 rounded-lg bg-elevated p-5">
        <h2 class="text-xl">{{ t('admin.anticheat.settings.rules') }}</h2>
        <p class="text-muted">{{ t('admin.anticheat.settings.rulesLede') }}</p>
        <p class="text-sm text-muted tabular-nums">
          {{
            t('admin.anticheat.settings.version', {
              version: data.rulesVersion,
              date: when(data.updatedAt),
            })
          }}
        </p>
      </section>

      <section
        v-for="group in GROUPS"
        :key="group.id"
        class="flex flex-col gap-4 rounded-lg bg-elevated p-5"
      >
        <h3 class="text-lg font-medium text-highlighted">
          {{ t(`admin.anticheat.settings.groups.${group.id}`) }}
        </h3>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            v-for="field in group.fields"
            :key="`${field.section}.${field.key}`"
            :name="`${field.section}.${field.key}`"
            :label="t(`admin.anticheat.settings.fields.${field.key}`)"
          >
            <UInputNumber
              :model-value="read(field)"
              :step="field.step"
              :max="field.max"
              class="w-40"
              @update:model-value="write(field, $event)"
            />
          </UFormField>
        </div>
      </section>

      <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
        <div class="flex flex-col gap-1">
          <h3 class="text-lg font-medium text-highlighted">
            {{ t('admin.anticheat.settings.policy') }}
          </h3>
          <p class="text-muted">{{ t('admin.anticheat.settings.policyLede') }}</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-2xl border-collapse text-left">
            <thead class="text-sm text-muted">
              <tr>
                <th class="px-2 py-2 font-medium" />
                <th v-for="band in ANTICHEAT_FILE_BANDS" :key="band" class="px-2 py-2 font-medium">
                  {{ t(`admin.anticheat.settings.policyBands.${band}`) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="kind in ANTICHEAT_PROJECT_KINDS"
                :key="kind"
                class="border-t border-default"
              >
                <th class="px-2 py-2 font-medium text-highlighted">
                  {{ t(`admin.anticheat.settings.policyKinds.${kind}`) }}
                </th>
                <td v-for="band in ANTICHEAT_FILE_BANDS" :key="band" class="px-2 py-2">
                  <USelect
                    :model-value="readPolicy(kind, band)"
                    :items="actionItems"
                    class="w-32"
                    :aria-label="`${t(`admin.anticheat.settings.policyKinds.${kind}`)}, ${t(`admin.anticheat.settings.policyBands.${band}`)}`"
                    @update:model-value="writePolicy(kind, band, $event as AnticheatAction)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="flex flex-wrap items-center gap-3">
        <UButton
          type="submit"
          :loading="saving"
          :disabled="!valid"
          :label="t('admin.anticheat.settings.save')"
        />
        <UButton
          type="button"
          color="neutral"
          variant="soft"
          :loading="rescoring"
          :label="t('admin.anticheat.settings.rescore')"
          @click="rescore"
        />
        <span class="text-sm text-muted">
          {{
            valid ? t('admin.anticheat.settings.saveNote') : t('admin.anticheat.settings.invalid')
          }}
        </span>
      </div>
    </UForm>

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <div class="flex flex-col gap-1">
        <h2 class="text-xl">{{ t('admin.anticheat.settings.modIds') }}</h2>
        <p class="text-muted">{{ t('admin.anticheat.settings.modIdsLede') }}</p>
      </div>
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="banModId">
        <UFormField :label="t('admin.anticheat.settings.modId')">
          <UInput v-model="modId" :maxlength="128" class="w-56" />
        </UFormField>
        <UFormField :label="t('admin.anticheat.settings.reason')" class="min-w-56 flex-1">
          <UInput v-model="modReason" :maxlength="500" class="w-full" />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="soft"
          :loading="banning"
          :disabled="!modId.trim() || !modReason.trim()"
          :label="t('admin.anticheat.settings.ban')"
        />
      </form>
      <p v-if="!bans?.length" class="text-muted">{{ t('admin.anticheat.settings.modIdsEmpty') }}</p>
      <ul v-else class="flex flex-col divide-y divide-default">
        <li v-for="ban in bans" :key="ban.modId" class="flex items-center gap-3 py-2.5">
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="font-semibold text-highlighted">{{ ban.modId }}</span>
            <span class="text-sm text-muted">{{ ban.reason }}</span>
            <span class="text-sm text-muted tabular-nums">
              {{
                t('admin.anticheat.settings.by', {
                  date: when(ban.createdAt),
                  actor: ban.createdBy ?? '–',
                })
              }}
            </span>
          </span>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            :label="t('admin.anticheat.settings.remove')"
            :aria-label="t('admin.anticheat.settings.removeLabel', { modId: ban.modId })"
            @click="unban(ban.modId)"
          />
        </li>
      </ul>
    </section>
  </div>
</template>
