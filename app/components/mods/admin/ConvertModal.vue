<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';

import type { ModAdminRow, ModSearchResult } from '#shared/schemas/mods';

// Turns a mod into a Modrinth or CurseForge one, or into a manual one. Its votes, proposer and
// reason stay. Closes with true once converted.
const props = defineProps<{ mod: ModAdminRow }>();
const emit = defineEmits<{ close: [converted: boolean] }>();

const { t } = useI18n();
const toast = useToast();

const mode = ref<'search' | 'manual'>(props.mod.source === 'manual' ? 'search' : 'manual');
const modes = computed<TabsItem[]>(() => [
  { label: t('admin.mods.add.fromSearch'), value: 'search' },
  { label: t('admin.mods.add.manual'), value: 'manual' },
]);

const manual = reactive({
  name: props.mod.name,
  summary: props.mod.summary,
  pageUrl: props.mod.pageUrl,
  iconUrl: '',
});
const pending = ref(false);

async function submit(body: Parameters<typeof modAdminActions.convert>[1]) {
  pending.value = true;
  try {
    await modAdminActions.convert(props.mod.id, body);
    toast.add({
      title: t('admin.mods.convert.done'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
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

function onPick(result: ModSearchResult) {
  void submit({ source: result.source, sourceId: result.sourceId });
}

function onManual() {
  void submit({
    source: 'manual',
    name: manual.name,
    summary: manual.summary,
    pageUrl: manual.pageUrl,
    iconUrl: manual.iconUrl || undefined,
  });
}
</script>

<template>
  <UModal
    :title="t('admin.mods.convert.title', { name: props.mod.name })"
    :description="t('admin.mods.convert.lede', { source: t(`mods.sources.${props.mod.source}`) })"
    :close="false"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UTabs v-model="mode" :items="modes" :content="false" />
        <ModsSearch v-if="mode === 'search'" @pick="onPick" />
        <form
          v-else
          id="mods-convert-manual"
          class="flex flex-col gap-4"
          @submit.prevent="onManual"
        >
          <UFormField :label="t('admin.mods.add.name')" name="name" required>
            <UInput v-model="manual.name" :maxlength="80" required class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.mods.add.summary')" name="summary">
            <UInput v-model="manual.summary" :maxlength="200" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.mods.add.pageUrl')" name="pageUrl" required>
            <UInput
              v-model="manual.pageUrl"
              type="url"
              placeholder="https://"
              required
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('admin.mods.add.iconUrl')"
            :help="t('admin.mods.convert.iconHelp')"
            name="iconUrl"
          >
            <UInput v-model="manual.iconUrl" type="url" placeholder="https://" class="w-full" />
          </UFormField>
        </form>
      </div>
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
          v-if="mode === 'manual'"
          type="submit"
          form="mods-convert-manual"
          :label="t('admin.mods.convert.submit')"
          :loading="pending"
        />
      </div>
    </template>
  </UModal>
</template>
