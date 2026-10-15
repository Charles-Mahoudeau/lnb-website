<script setup lang="ts">
import type { ModSearchResult } from '#shared/schemas/mods';
import { REASON_MAX, modReasonBody } from '#shared/schemas/mods';

// Suggest a mod: pick it from the search, then say why. Closes with true once it's added.
const props = defineProps<{ gameVersion: string; loader: string; left: number; max: number }>();
const emit = defineEmits<{ close: [added: boolean] }>();

const { t } = useI18n();
const toast = useToast();
const { suggest } = useModList();

const picked = ref<ModSearchResult | null>(null);
const state = reactive({ reason: '' });
const pending = ref(false);

async function onSubmit() {
  if (!picked.value) return;
  pending.value = true;
  try {
    await suggest({
      source: picked.value.source,
      sourceId: picked.value.sourceId,
      reason: state.reason,
    });
    toast.add({ title: t('mods.suggest.done'), color: 'success', icon: 'i-lucide-circle-check' });
    emit('close', true);
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
  <UModal
    :title="t('mods.suggest.title')"
    :description="
      t('mods.suggest.lede', {
        loader: t(`mods.loaders.${props.loader}`),
        version: props.gameVersion,
        left: props.left,
        max: props.max,
      })
    "
    :close="false"
  >
    <template #body>
      <ModsSearch v-if="!picked" @pick="picked = $event" />
      <UForm
        v-else
        id="mods-suggest"
        :schema="modReasonBody"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium text-highlighted">{{ t('mods.suggest.mod') }}</span>
          <div class="flex items-center gap-3 rounded-md bg-accented p-2">
            <ModsIcon :name="picked.name" :src="null" size="sm" />
            <span class="flex min-w-0 grow flex-col">
              <span class="truncate font-semibold text-highlighted">{{ picked.name }}</span>
              <span class="truncate text-sm text-muted">{{
                t(`mods.sources.${picked.source}`)
              }}</span>
            </span>
            <UButton
              size="md"
              color="neutral"
              variant="ghost"
              :label="t('mods.suggest.change')"
              @click="picked = null"
            />
          </div>
        </div>
        <UFormField
          :label="t('mods.suggest.reason')"
          :help="t('mods.suggest.reasonHelp')"
          name="reason"
        >
          <UTextarea
            v-model="state.reason"
            :placeholder="t('mods.suggest.reasonPlaceholder')"
            :rows="4"
            :maxlength="REASON_MAX"
            autoresize
            class="w-full"
          />
          <template #hint>
            <span class="tabular-nums">{{ state.reason.length }} / {{ REASON_MAX }}</span>
          </template>
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('mods.cancel')"
          :disabled="pending"
          @click="emit('close', false)"
        />
        <UButton
          type="submit"
          form="mods-suggest"
          :label="t('mods.suggest.submit')"
          :disabled="!picked"
          :loading="pending"
        />
      </div>
    </template>
  </UModal>
</template>
