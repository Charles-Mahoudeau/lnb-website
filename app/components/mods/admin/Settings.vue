<script setup lang="ts">
import { MOD_LOADERS } from '#shared/schemas/mods';
import type { ModSettingsView } from '#shared/schemas/mods';

// The mod list settings: open or closed, the suggestion limit, and what the server runs.
const { t } = useI18n();
const toast = useToast();
const { settings, save } = useModSettings();
const { data, refresh } = await settings;

// The end is edited as a Paris wall-clock time, like the other dates in the admin.
const state = reactive<ModSettingsView & { endsLocal: string }>({
  open: true,
  votingEndsAt: null,
  showCountdown: true,
  endsLocal: '',
  maxSuggestions: 5,
  gameVersion: '1.21.1',
  loader: 'neoforge',
});
watch(
  data,
  (value) => {
    if (!value) return;
    Object.assign(state, value);
    state.endsLocal = value.votingEndsAt ? isoToParisLocal(value.votingEndsAt) : '';
  },
  { immediate: true },
);

const loaders = computed(() =>
  MOD_LOADERS.map((value) => ({ value, label: t(`mods.loaders.${value}`) })),
);

const pending = ref(false);
async function onSave() {
  pending.value = true;
  try {
    const { endsLocal, ...rest } = state;
    const votingEndsAt = endsLocal ? parisLocalToIso(endsLocal) : null;
    if (endsLocal && !votingEndsAt) throw new ModError('failed');
    await save({ ...rest, votingEndsAt });
    toast.add({
      title: t('admin.mods.settings.saved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await refresh();
  } catch (error) {
    const problem = error instanceof ModError ? error.problem : 'failed';
    toast.add({
      title: t(`mods.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form class="flex flex-col gap-5 rounded-lg bg-elevated p-5" @submit.prevent="onSave">
    <h2 class="text-xl font-medium text-highlighted">{{ t('admin.mods.settings.title') }}</h2>
    <USwitch
      v-model="state.open"
      :label="t('admin.mods.settings.open')"
      :description="t('admin.mods.settings.openHelp')"
      :ui="{
        root: 'flex-row-reverse justify-between gap-6',
        label: 'font-semibold text-highlighted',
      }"
    />
    <USeparator />
    <div class="flex flex-wrap items-center justify-between gap-6">
      <div class="flex max-w-md flex-col gap-1">
        <label for="mods-voting-ends" class="font-semibold text-highlighted">
          {{ t('admin.mods.settings.votingEnds') }}
        </label>
        <span class="text-sm text-muted">{{ t('admin.mods.settings.votingEndsHelp') }}</span>
      </div>
      <div class="flex items-center gap-2">
        <UInput id="mods-voting-ends" v-model="state.endsLocal" type="datetime-local" />
        <UButton
          v-if="state.endsLocal"
          color="neutral"
          variant="ghost"
          :label="t('admin.mods.settings.votingEndsClear')"
          @click="state.endsLocal = ''"
        />
      </div>
    </div>
    <USwitch
      v-model="state.showCountdown"
      :label="t('admin.mods.settings.showCountdown')"
      :description="t('admin.mods.settings.showCountdownHelp')"
      :ui="{
        root: 'flex-row-reverse justify-between gap-6',
        label: 'font-semibold text-highlighted',
      }"
    />
    <USeparator />
    <div class="flex flex-wrap items-center justify-between gap-6">
      <div class="flex max-w-md flex-col gap-1">
        <label for="mods-max-suggestions" class="font-semibold text-highlighted">
          {{ t('admin.mods.settings.maxSuggestions') }}
        </label>
        <span class="text-sm text-muted">{{ t('admin.mods.settings.maxSuggestionsHelp') }}</span>
      </div>
      <UInputNumber
        id="mods-max-suggestions"
        v-model="state.maxSuggestions"
        :min="0"
        :max="50"
        class="w-36"
      />
    </div>
    <USeparator />
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap gap-4">
        <UFormField :label="t('admin.mods.settings.gameVersion')" name="gameVersion">
          <UInput v-model="state.gameVersion" class="w-36" />
        </UFormField>
        <UFormField :label="t('admin.mods.settings.loader')" name="loader">
          <USelect v-model="state.loader" :items="loaders" class="w-44" />
        </UFormField>
      </div>
      <span class="text-sm text-muted">{{ t('admin.mods.settings.serverHelp') }}</span>
    </div>
    <div>
      <!-- Add mod is the page's main action, so saving is neutral (docs/design.md). -->
      <UButton
        type="submit"
        color="neutral"
        variant="soft"
        :label="t('admin.mods.settings.save')"
        :loading="pending"
      />
    </div>
  </form>
</template>
