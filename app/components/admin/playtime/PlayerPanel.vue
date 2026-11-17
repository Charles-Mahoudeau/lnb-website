<script setup lang="ts">
import { WardenConfirmModal } from '#components';

import type { PlaytimeAdminPlayer } from '#shared/schemas/playtime';
import { formatPlaytimeMinutes, parsePlaytimeMinutes } from '#shared/utils/playtime-admin';

// The Playtime card of a player's Warden page: where they stand, the last eight weeks, their own
// overrides, extra time for this week and exemptions. Every write answers with the refreshed panel.
const props = defineProps<{ userId: string }>();

const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const confirmModal = overlay.create(WardenConfirmModal);

const { data, error } = await usePlaytimePlayer(props.userId);
const actions = playtimePlayerActions(props.userId);

const duration = (seconds: number) => formatWardenDuration(seconds, locale.value);
const dateTime = (iso: string) => formatWardenDateTime(iso, locale.value);

function done(title: string) {
  toast.add({ title, color: 'success', icon: 'i-lucide-circle-check' });
}
async function run(work: () => Promise<PlaytimeAdminPlayer>, success: string): Promise<boolean> {
  try {
    data.value = await work();
    done(success);
    return true;
  } catch (failure) {
    const problem = failure instanceof PlaytimeAdminError ? failure.problem : 'failed';
    toast.add({
      title: t(`admin.playtime.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    return false;
  }
}
async function confirm(title: string, description: string): Promise<boolean> {
  const result: unknown = await confirmModal.open({
    title,
    description,
    confirmLabel: t('wardenAdmin.player.confirm'),
    cancelLabel: t('wardenAdmin.player.cancel'),
    destructive: true,
  }).result;
  return result === true;
}

const PILL: Record<PlaytimeAdminPlayer['state'], string> = {
  counting: 'bg-secondary/15 text-secondary',
  grace: 'bg-grace/15 text-grace',
  free: 'bg-success/15 text-success',
  blocked: 'bg-error/15 text-error',
  unlimited: 'bg-accented text-muted',
};
const stateKey = computed(() =>
  data.value?.state === 'unlimited' ? (data.value.reason ?? 'exempt') : data.value?.state,
);

// The eight weeks: bars scaled to the tallest of the allowance and the counted time.
const chartMax = computed(() =>
  Math.max(1, ...(data.value?.weeks.flatMap((w) => [w.countedSeconds, w.allowanceSeconds]) ?? [])),
);
const barHeight = (seconds: number) => `${String(Math.round((seconds / chartMax.value) * 100))}%`;
const weekLabel = (iso: string) =>
  new Intl.DateTimeFormat(locale.value, { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(
    new Date(`${iso}T12:00:00Z`),
  );

// Overrides: empty means "follow the school, then the defaults".
const allowance = ref('');
const grace = ref('');
const warnings = ref('');
watchEffect(() => {
  const overrides = data.value?.overrides;
  if (!overrides) return;
  allowance.value =
    overrides.allowanceSeconds === null ? '' : String(overrides.allowanceSeconds / 3600);
  grace.value = overrides.graceSeconds === null ? '' : String(overrides.graceSeconds / 60);
  warnings.value = overrides.warningsMinutes
    ? formatPlaytimeMinutes(overrides.warningsMinutes)
    : '';
});
const parsedAllowance = computed(() => {
  if (allowance.value.trim() === '') return null;
  const hours = Number(allowance.value.replace(',', '.'));
  return Number.isFinite(hours) && hours >= 0 ? Math.round(hours * 3600) : undefined;
});
const parsedGrace = computed(() => {
  if (grace.value.trim() === '') return null;
  const minutes = Number(grace.value);
  return Number.isInteger(minutes) && minutes >= 0 ? minutes * 60 : undefined;
});
const parsedWarnings = computed(() =>
  warnings.value.trim() === '' ? null : (parsePlaytimeMinutes(warnings.value) ?? undefined),
);
const overridesValid = computed(
  () =>
    parsedAllowance.value !== undefined &&
    parsedGrace.value !== undefined &&
    parsedWarnings.value !== undefined,
);
const overridesChanged = computed(() => {
  const current = data.value?.overrides;
  return (
    !!current &&
    (parsedAllowance.value !== current.allowanceSeconds ||
      parsedGrace.value !== current.graceSeconds ||
      JSON.stringify(parsedWarnings.value) !== JSON.stringify(current.warningsMinutes))
  );
});
async function saveOverrides() {
  if (!overridesValid.value) return;
  await run(
    () =>
      actions.saveOverrides({
        allowanceSeconds: parsedAllowance.value as number | null,
        graceSeconds: parsedGrace.value as number | null,
        warningsMinutes: parsedWarnings.value as number[] | null,
      }),
    t('admin.playtime.player.overrides.saved'),
  );
}

// Extra time.
const PRESETS = [900, 1800, 3600, 7200] as const;
const grantSeconds = ref<number>(1800);
const grantReason = ref('');
async function addGrant() {
  const reason = grantReason.value.trim();
  if (!reason) return;
  if (
    await run(
      () => actions.addGrant({ seconds: grantSeconds.value, reason }),
      t('admin.playtime.player.grants.added'),
    )
  ) {
    grantReason.value = '';
  }
}
async function revokeGrant(id: number) {
  if (
    await confirm(
      t('admin.playtime.player.grants.revokeTitle'),
      t('admin.playtime.player.grants.revokeBody'),
    )
  ) {
    await run(() => actions.revokeGrant(id), t('admin.playtime.player.grants.revoked'));
  }
}

// Exemptions.
const exemptScope = ref('user');
const exemptReason = ref('');
const exemptUntil = ref('');
const scopeItems = computed(() => [
  { label: t('admin.playtime.player.exemptions.wholeAccount'), value: 'user' },
  ...(data.value?.accounts ?? []).map((account) => ({
    label: t('admin.playtime.player.exemptions.oneAccount', { username: account.username }),
    value: account.uuid,
  })),
]);
async function addExemption() {
  const reason = exemptReason.value.trim();
  if (!reason) return;
  const until = exemptUntil.value ? new Date(`${exemptUntil.value}T23:59:59`).toISOString() : null;
  if (
    await run(
      () =>
        actions.addExemption({
          ...(exemptScope.value === 'user' ? {} : { minecraftUuid: exemptScope.value }),
          reason,
          until,
        }),
      t('admin.playtime.player.exemptions.added'),
    )
  ) {
    exemptReason.value = '';
    exemptUntil.value = '';
  }
}
async function revokeExemption(id: number) {
  if (
    await confirm(
      t('admin.playtime.player.exemptions.revokeTitle'),
      t('admin.playtime.player.exemptions.revokeBody'),
    )
  ) {
    await run(() => actions.revokeExemption(id), t('admin.playtime.player.exemptions.revoked'));
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <h2 class="text-2xl font-medium text-highlighted">{{ t('admin.playtime.player.title') }}</h2>
    <UAlert
      v-if="error || !data"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.playtime.loadFailed')"
    />
    <div v-else class="flex flex-col gap-6 rounded-lg bg-elevated p-5">
      <div class="flex flex-wrap items-center gap-3">
        <span
          class="inline-flex rounded-full px-3 py-1 text-sm font-medium"
          :class="PILL[data.state]"
        >
          {{ t(`admin.playtime.live.states.${stateKey}`) }}
        </span>
        <span v-if="data.mode !== 'enforce'" class="text-sm text-muted">
          {{ t(`admin.playtime.player.mode.${data.mode}`) }}
        </span>
      </div>

      <div v-if="data.state !== 'unlimited'" class="flex flex-col gap-2">
        <UProgress
          :model-value="data.percentUsed"
          :color="data.state === 'blocked' ? 'error' : 'secondary'"
        />
        <span class="text-sm text-muted tabular-nums">
          {{ duration(data.usedSeconds) }} / {{ duration(data.allowanceSeconds) }}
        </span>
      </div>

      <dl class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div
          v-for="item in [
            { key: 'counted', value: duration(data.usedSeconds) },
            { key: 'allowance', value: duration(data.allowanceSeconds) },
            { key: 'total', value: duration(data.totalPlayedSeconds) },
            { key: 'accounts', value: String(data.accounts.length) },
          ]"
          :key="item.key"
          class="flex flex-col gap-0.5"
        >
          <dt class="text-sm text-muted">{{ t(`admin.playtime.player.figures.${item.key}`) }}</dt>
          <dd class="font-display text-xl font-bold text-highlighted tabular-nums">
            {{ item.value }}
          </dd>
        </div>
      </dl>

      <div class="flex flex-col gap-3">
        <h3 class="font-semibold text-highlighted">{{ t('admin.playtime.player.weeks.title') }}</h3>
        <ul class="grid grid-cols-8 gap-2" role="list">
          <li
            v-for="week in data.weeks"
            :key="week.weekStart"
            class="flex flex-col items-center gap-1.5"
          >
            <div class="relative flex h-24 w-full items-end justify-center rounded bg-accented/40">
              <span
                v-if="week.closed"
                class="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs text-muted"
              >
                {{ t('admin.playtime.player.weeks.closed') }}
              </span>
              <span
                v-else
                class="w-3/5 rounded-t bg-secondary"
                :style="{ height: barHeight(week.countedSeconds) }"
                :title="`${duration(week.countedSeconds)} / ${duration(week.allowanceSeconds)}`"
              />
              <span
                v-if="!week.closed"
                class="absolute inset-x-0 border-t border-dashed border-muted"
                :style="{ bottom: barHeight(week.allowanceSeconds) }"
              />
            </div>
            <span class="text-xs text-muted tabular-nums">{{ weekLabel(week.weekStart) }}</span>
          </li>
        </ul>
        <p class="text-sm text-muted">{{ t('admin.playtime.player.weeks.legend') }}</p>
      </div>

      <div class="flex flex-col gap-3 border-t border-default pt-5">
        <h3 class="font-semibold text-highlighted">
          {{ t('admin.playtime.player.overrides.title') }}
        </h3>
        <p class="text-sm text-muted">
          {{ t('admin.playtime.player.overrides.lede', { school: data.school ?? '–' }) }}
        </p>
        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField
            :label="t('admin.playtime.defaults.allowance')"
            :hint="
              t('admin.playtime.player.overrides.inherits', {
                value: duration(data.inherited.allowanceSeconds),
              })
            "
            :error="
              parsedAllowance === undefined
                ? t('admin.playtime.player.overrides.invalid')
                : undefined
            "
          >
            <UInput
              v-model="allowance"
              inputmode="decimal"
              :placeholder="String(data.inherited.allowanceSeconds / 3600)"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('admin.playtime.defaults.grace')"
            :hint="
              t('admin.playtime.player.overrides.inherits', {
                value: duration(data.inherited.graceSeconds),
              })
            "
            :error="
              parsedGrace === undefined ? t('admin.playtime.player.overrides.invalid') : undefined
            "
          >
            <UInput
              v-model="grace"
              inputmode="numeric"
              :placeholder="String(data.inherited.graceSeconds / 60)"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('admin.playtime.defaults.warnings')"
            :hint="
              t('admin.playtime.player.overrides.inherits', {
                value: formatPlaytimeMinutes(data.inherited.warningsMinutes),
              })
            "
            :error="
              parsedWarnings === undefined ? t('admin.playtime.defaults.minutesInvalid') : undefined
            "
          >
            <UInput
              v-model="warnings"
              :placeholder="formatPlaytimeMinutes(data.inherited.warningsMinutes)"
              class="w-full"
            />
          </UFormField>
        </div>
        <div>
          <UButton
            color="neutral"
            variant="soft"
            :label="t('admin.playtime.save')"
            :disabled="!overridesValid || !overridesChanged"
            @click="saveOverrides"
          />
        </div>
      </div>

      <div class="flex flex-col gap-3 border-t border-default pt-5">
        <h3 class="font-semibold text-highlighted">
          {{ t('admin.playtime.player.grants.title') }}
        </h3>
        <p class="text-sm text-muted">{{ t('admin.playtime.player.grants.lede') }}</p>
        <div
          class="flex flex-wrap gap-2"
          role="radiogroup"
          :aria-label="t('admin.playtime.player.grants.title')"
        >
          <button
            v-for="seconds in PRESETS"
            :key="seconds"
            type="button"
            role="radio"
            :aria-checked="grantSeconds === seconds"
            class="rounded-full border px-4 py-1.5 text-sm transition-colors"
            :class="
              grantSeconds === seconds
                ? 'border-secondary bg-accented text-highlighted'
                : 'border-default text-muted hover:bg-accented'
            "
            @click="grantSeconds = seconds"
          >
            +{{ duration(seconds) }}
          </button>
        </div>
        <div class="flex flex-wrap gap-3">
          <UInput
            v-model="grantReason"
            :placeholder="t('admin.playtime.player.reason')"
            maxlength="300"
            class="min-w-60 flex-1"
            @keydown.enter="addGrant"
          />
          <UButton
            color="neutral"
            variant="soft"
            :label="t('admin.playtime.player.grants.add')"
            :disabled="!grantReason.trim()"
            @click="addGrant"
          />
        </div>
        <ul v-if="data.grants.length" class="flex flex-col divide-y divide-default">
          <li
            v-for="grant in data.grants"
            :key="grant.id"
            class="flex flex-wrap items-center gap-3 py-2.5"
          >
            <div class="flex min-w-0 flex-1 basis-60 flex-col">
              <span class="font-medium text-highlighted"
                >+{{ duration(grant.seconds) }}, {{ grant.reason }}</span
              >
              <span class="text-sm text-muted">
                {{ [grant.grantedByName, dateTime(grant.createdAt)].filter(Boolean).join(', ') }}
              </span>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              :label="t('admin.playtime.player.revoke')"
              @click="revokeGrant(grant.id)"
            />
          </li>
        </ul>
      </div>

      <div class="flex flex-col gap-3 border-t border-default pt-5">
        <h3 class="font-semibold text-highlighted">
          {{ t('admin.playtime.player.exemptions.title') }}
        </h3>
        <p class="text-sm text-muted">{{ t('admin.playtime.player.exemptions.lede') }}</p>
        <div class="grid gap-3 sm:grid-cols-3">
          <USelect v-model="exemptScope" :items="scopeItems" class="w-full" />
          <UInput
            v-model="exemptReason"
            :placeholder="t('admin.playtime.player.reason')"
            maxlength="300"
            class="w-full"
          />
          <UInput
            v-model="exemptUntil"
            type="date"
            :aria-label="t('admin.playtime.player.exemptions.until')"
            class="w-full"
          />
        </div>
        <div>
          <UButton
            color="neutral"
            variant="soft"
            :label="t('admin.playtime.player.exemptions.add')"
            :disabled="!exemptReason.trim()"
            @click="addExemption"
          />
        </div>
        <ul v-if="data.exemptions.length" class="flex flex-col divide-y divide-default">
          <li
            v-for="exemption in data.exemptions"
            :key="exemption.id"
            class="flex flex-wrap items-center gap-3 py-2.5"
          >
            <div class="flex min-w-0 flex-1 basis-60 flex-col">
              <span class="font-medium text-highlighted">
                {{
                  exemption.scope === 'user'
                    ? t('admin.playtime.player.exemptions.wholeAccount')
                    : t('admin.playtime.player.exemptions.oneAccount', {
                        username: exemption.username,
                      })
                }}, {{ exemption.reason }}
              </span>
              <span class="text-sm text-muted">
                {{
                  [
                    exemption.setByName,
                    dateTime(exemption.createdAt),
                    exemption.until
                      ? t('admin.playtime.player.exemptions.endsOn', {
                          date: dateTime(exemption.until),
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(', ')
                }}
              </span>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              :label="t('admin.playtime.player.revoke')"
              @click="revokeExemption(exemption.id)"
            />
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
