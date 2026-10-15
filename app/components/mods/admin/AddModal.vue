<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';

import type { ModSearchResult } from '#shared/schemas/mods';

// Adds a mod to the official list, from the search or by hand. Closes with true once added.
const emit = defineEmits<{ close: [added: boolean] }>();

const { t } = useI18n();
const toast = useToast();
const { add } = modAdminActions;

const mode = ref<'search' | 'manual'>('search');
const modes = computed<TabsItem[]>(() => [
  { label: t('admin.mods.add.fromSearch'), value: 'search' },
  { label: t('admin.mods.add.manual'), value: 'manual' },
]);

const manual = reactive({ name: '', summary: '', pageUrl: '', iconUrl: '' });
const pending = ref(false);

async function submit(body: Parameters<typeof add>[0]) {
  pending.value = true;
  try {
    await add(body);
    toast.add({
      title: t('admin.mods.add.added'),
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
  <UModal :title="t('admin.mods.add.title')" :description="t('admin.mods.add.lede')" :close="false">
    <template #body>
      <div class="flex flex-col gap-4">
        <UTabs v-model="mode" :items="modes" :content="false" />
        <ModsSearch v-if="mode === 'search'" @pick="onPick" />
        <form v-else id="mods-add-manual" class="flex flex-col gap-4" @submit.prevent="onManual">
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
            :help="t('admin.mods.add.iconHelp')"
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
          form="mods-add-manual"
          :label="t('admin.mods.add.submit')"
          :loading="pending"
        />
      </div>
    </template>
  </UModal>
</template>
