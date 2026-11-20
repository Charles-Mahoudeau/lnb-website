<script setup lang="ts">
import type { ModpackTool, ModpackToolView } from '#shared/schemas/modpack';
import { MODPACK_TOOL_KINDS } from '#shared/schemas/modpack';

// Makes a file of the Files library the current one of a tool. Closes with true once published.
const props = defineProps<{ tool: ModpackTool; current?: ModpackToolView }>();
const emit = defineEmits<{ close: [published: boolean] }>();

const { t, locale } = useI18n();
const toast = useToast();

const { data: library } = await useAdminFiles();
const kind = MODPACK_TOOL_KINDS[props.tool];
const jars = computed(() => (library.value?.items ?? []).filter((file) => file.kind === kind));
const items = computed(() =>
  jars.value.map((file) => ({
    value: file.id,
    label: `${file.name} · ${formatBytes(file.size, locale.value)}${
      file.id === props.current?.fileId ? ` · ${t('admin.modlist.tools.currentTag')}` : ''
    }`,
  })),
);

const form = reactive({ fileId: '', version: '', notes: '' });
const pending = ref(false);
const name = computed(() => t(`admin.modlist.tools.${props.tool}.name`));

async function onSubmit() {
  pending.value = true;
  try {
    await modpackActions.publishTool(props.tool, {
      fileId: form.fileId,
      version: form.version,
      notes: form.notes,
    });
    toast.add({
      title: t('admin.modlist.tools.done', { name: name.value, version: form.version }),
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
</script>

<template>
  <UModal
    :title="t('admin.modlist.tools.modalTitle', { name })"
    :description="t('admin.modlist.tools.modalLede')"
    :close="false"
  >
    <template #body>
      <form id="modlist-tool" class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <UFormField
          :label="t('admin.modlist.tools.pickLabel')"
          name="file"
          required
          :help="jars.length ? undefined : t('admin.modlist.tools.noJars')"
        >
          <USelect
            v-model="form.fileId"
            :items="items"
            :placeholder="t('admin.modlist.tools.pickFile')"
            :disabled="!jars.length"
            class="w-full"
          />
          <template #hint>
            <ULink to="/admin/modpack/files" class="text-sm">{{
              t('admin.modlist.tools.openFiles')
            }}</ULink>
          </template>
        </UFormField>
        <UFormField
          :label="t('admin.modlist.add.version')"
          :help="t('admin.modlist.tools.versionHelp')"
          name="version"
          required
        >
          <UInput v-model="form.version" :maxlength="40" required class="w-full" />
        </UFormField>
        <UFormField :label="t('admin.modlist.tools.notesLabel')" name="notes">
          <UTextarea v-model="form.notes" :maxlength="500" :rows="3" class="w-full" />
        </UFormField>
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="t('admin.modlist.tools.warning')"
        />
      </form>
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
          form="modlist-tool"
          :label="t('admin.modlist.tools.publish')"
          :disabled="!form.fileId || !form.version.trim()"
          :loading="pending"
        />
      </div>
    </template>
  </UModal>
</template>
