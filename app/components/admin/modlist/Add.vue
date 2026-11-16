<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';

import { MODPACK_SIDES } from '#shared/schemas/modpack';
import type { ModpackAddBody, ModpackSide } from '#shared/schemas/modpack';
import type { ModSearchResult } from '#shared/schemas/mods';

// Adds a mod to the pack: from a Modrinth or CurseForge search, from a link the site downloads, or
// from a jar of the Files library. Closes with true once added.
const emit = defineEmits<{ close: [added: boolean] }>();

const { t, locale } = useI18n();
const toast = useToast();

const mode = ref<'search' | 'url' | 'upload'>('search');
const modes = computed<TabsItem[]>(() => [
  { label: t('admin.modlist.add.fromSearch'), value: 'search' },
  { label: t('admin.modlist.add.fromUrl'), value: 'url' },
  { label: t('admin.modlist.add.fromFile'), value: 'upload' },
]);
const sideItems = computed(() =>
  MODPACK_SIDES.map((value) => ({ value, label: t(`admin.modlist.sides.${value}`) })),
);

const form = reactive<{
  name: string;
  version: string;
  url: string;
  fileId: string;
  side: ModpackSide;
  optional: boolean;
}>({
  name: '',
  version: '',
  url: '',
  fileId: '',
  side: 'both',
  optional: false,
});
const pending = ref(false);

const { data: library } = await useAdminFiles();
const jars = computed(() => (library.value?.items ?? []).filter((file) => file.kind === 'mod'));
const jarItems = computed(() =>
  jars.value.map((file) => ({
    value: file.id,
    label: `${file.name} · ${formatBytes(file.size, locale.value)}`,
  })),
);

async function submit(body: ModpackAddBody) {
  pending.value = true;
  try {
    await modpackActions.add(body);
    toast.add({
      title: t('admin.modlist.add.added'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    const problem = error instanceof ModpackError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.modlist.errors.${problem}`),
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

function onSubmit() {
  const common = {
    name: form.name,
    version: form.version,
    side: form.side,
    optional: form.optional,
  };
  void submit(
    mode.value === 'url'
      ? { source: 'url', url: form.url, ...common }
      : { source: 'upload', fileId: form.fileId, ...common },
  );
}
</script>

<template>
  <UModal
    :title="t('admin.modlist.add.title')"
    :description="t('admin.modlist.add.lede')"
    :close="false"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UTabs v-model="mode" :items="modes" :content="false" />
        <ModsSearch v-if="mode === 'search'" ignore-listing @pick="onPick" />
        <form v-else id="modlist-add" class="flex flex-col gap-4" @submit.prevent="onSubmit">
          <UFormField
            v-if="mode === 'url'"
            :label="t('admin.modlist.add.url')"
            :help="t('admin.modlist.add.urlHelp')"
            name="url"
            required
          >
            <UInput v-model="form.url" type="url" placeholder="https://" required class="w-full" />
          </UFormField>
          <UFormField
            v-else
            :label="t('admin.modlist.add.file')"
            :help="jars.length ? undefined : t('admin.modlist.add.noJars')"
            name="file"
            required
          >
            <USelect
              v-model="form.fileId"
              :items="jarItems"
              :placeholder="t('admin.modlist.add.pickFile')"
              :disabled="!jars.length"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.modlist.add.name')" name="name" required>
            <UInput v-model="form.name" :maxlength="80" required class="w-full" />
          </UFormField>
          <UFormField
            :label="t('admin.modlist.add.version')"
            :help="t('admin.modlist.add.versionHelp')"
            name="version"
            required
          >
            <UInput v-model="form.version" :maxlength="40" required class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.modlist.side')" name="side">
            <USelect v-model="form.side" :items="sideItems" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('admin.modlist.optional')"
            :help="t('admin.modlist.optionalHelp')"
            name="optional"
          >
            <USwitch v-model="form.optional" />
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
          v-if="mode !== 'search'"
          type="submit"
          form="modlist-add"
          :label="t('admin.modlist.add.submit')"
          :disabled="mode === 'upload' && !form.fileId"
          :loading="pending"
        />
      </div>
    </template>
  </UModal>
</template>
