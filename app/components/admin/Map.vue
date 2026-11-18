<script setup lang="ts">
import { mapSettingsBody } from '#shared/schemas/map';
import type { MapMode } from '#shared/schemas/map';

// The address of the live map the /minecraft/map page shows. Full admins only.
const { t } = useI18n();
const toast = useToast();
const { isEnabled } = useFlags();

const { data, error, refresh } = await useAdminMap();

const url = ref(data.value?.url ?? '');
const valid = computed(() => mapSettingsBody.safeParse({ url: url.value }).success);
const unchanged = computed(() => url.value.trim() === (data.value?.url ?? ''));
const saving = ref(false);

// Who can see the map: the cards, and the opening date and time in Paris.
const mode = ref<MapMode>(data.value?.mode ?? 'open');
const opensLocal = ref(data.value?.opensAt ? isoToParisLocal(data.value.opensAt) : '');
const opensIso = computed(() => (opensLocal.value ? parisLocalToIso(opensLocal.value) : null));
const accessValid = computed(() => mode.value !== 'date' || !!opensIso.value);
const accessUnchanged = computed(
  () =>
    mode.value === (data.value?.mode ?? 'open') &&
    (mode.value !== 'date' ||
      opensIso.value === (data.value?.opensAt ? new Date(data.value.opensAt).toISOString() : null)),
);
const savingAccess = ref(false);
const modes: { value: MapMode; icon: string }[] = [
  { value: 'open', icon: 'i-lucide-map' },
  { value: 'date', icon: 'i-lucide-calendar-clock' },
  { value: 'closed', icon: 'i-lucide-lock' },
];
const { locale } = useI18n();
const summary = computed(() => {
  if (mode.value === 'open') return t('admin.map.access.summary.open');
  if (mode.value === 'closed') return t('admin.map.access.summary.closed');
  if (!opensIso.value) return t('admin.map.access.summary.pick');
  const at = new Date(opensIso.value);
  const date = new Intl.DateTimeFormat(locale.value, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Europe/Paris',
  }).format(at);
  return at.getTime() > Date.now()
    ? t('admin.map.access.summary.date', { date })
    : t('admin.map.access.summary.past', { date });
});

async function saveAccess() {
  savingAccess.value = true;
  try {
    await mapActions.setSettings({
      mode: mode.value,
      ...(mode.value === 'date' ? { opensAt: opensIso.value } : {}),
    });
    toast.add({
      title: t('admin.map.access.saved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch {
    toast.add({
      title: t('admin.map.errors.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
  mode.value = data.value?.mode ?? 'open';
  opensLocal.value = data.value?.opensAt ? isoToParisLocal(data.value.opensAt) : '';
  savingAccess.value = false;
}

async function save() {
  saving.value = true;
  try {
    await mapActions.setSettings({ url: url.value });
    toast.add({
      title: t('admin.map.address.saved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch {
    toast.add({
      title: t('admin.map.errors.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
  url.value = data.value?.url ?? '';
  saving.value = false;
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.map.errors.loadFailed')"
  />
  <div v-else class="flex max-w-4xl flex-col gap-8">
    <p class="text-muted">{{ t('admin.map.note') }}</p>
    <UAlert
      v-if="!isEnabled('map')"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="t('admin.map.flagOff')"
    />

    <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h2 class="text-xl font-bold text-highlighted">{{ t('admin.map.address.title') }}</h2>
      <p class="text-sm text-muted">{{ t('admin.map.address.help') }}</p>
      <form class="flex flex-wrap items-start gap-3" @submit.prevent="save">
        <UFormField
          :label="t('admin.map.address.label')"
          name="url"
          class="min-w-64 flex-1"
          :help="t('admin.map.address.default', { url: data.defaultUrl })"
          :error="valid ? undefined : t('admin.map.address.invalid')"
        >
          <UInput
            v-model="url"
            inputmode="url"
            :placeholder="data.defaultUrl"
            :maxlength="500"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="soft"
          class="mt-6"
          :disabled="!valid || unchanged"
          :loading="saving"
          :label="t('admin.map.address.save')"
        />
      </form>
    </section>

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <h2 class="text-xl font-bold text-highlighted">{{ t('admin.map.access.title') }}</h2>
      <p class="text-sm text-muted">{{ t('admin.map.access.help') }}</p>
      <div class="grid gap-3 sm:grid-cols-3" role="group" :aria-label="t('admin.map.access.title')">
        <button
          v-for="option in modes"
          :key="option.value"
          type="button"
          :aria-pressed="mode === option.value"
          class="flex flex-col gap-1.5 rounded-lg border p-4 text-left focus-visible:outline-2 focus-visible:outline-primary"
          :class="
            mode === option.value
              ? 'border-secondary bg-secondary/15'
              : 'border-default bg-default hover:bg-accented'
          "
          @click="mode = option.value"
        >
          <span class="flex items-center gap-2 font-semibold text-highlighted">
            <UIcon :name="option.icon" class="size-5" />
            {{ t(`admin.map.access.modes.${option.value}.title`) }}
          </span>
          <span class="text-sm text-muted">
            {{ t(`admin.map.access.modes.${option.value}.text`) }}
          </span>
        </button>
      </div>
      <UFormField
        v-if="mode === 'date'"
        :label="t('admin.map.access.opensAt')"
        :help="t('admin.map.access.parisTime')"
        class="max-w-xs"
      >
        <UInput v-model="opensLocal" type="datetime-local" class="w-full tabular-nums" />
      </UFormField>
      <div class="flex items-start gap-3 rounded-md bg-accented px-4 py-3">
        <UIcon name="i-lucide-info" class="mt-0.5 size-5 shrink-0 text-secondary" />
        <p>{{ summary }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <UButton
          color="primary"
          size="xl"
          :disabled="!accessValid || accessUnchanged"
          :loading="savingAccess"
          :label="t('admin.map.access.save')"
          @click="saveAccess"
        />
        <p class="text-sm text-muted">{{ t('admin.map.access.adminsSee') }}</p>
      </div>
    </section>
  </div>
</template>
