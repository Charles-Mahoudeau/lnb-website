<script setup lang="ts">
import type { AnticheatDecision, AnticheatProjectKind } from '#shared/schemas/anticheat';

// Approves or bans a Modrinth or CurseForge project that no player has used yet, by its ID.
// Closes with the new project's ID once saved, or null.
const props = defineProps<{ decision: AnticheatDecision; kind: AnticheatProjectKind }>();
const emit = defineEmits<{ close: [projectId: string | null] }>();

const { t } = useI18n();
const toast = useToast();

const source = ref<'modrinth' | 'curseforge'>('modrinth');
const sourceId = ref('');
const pending = ref(false);

const sources = computed(() => [
  { value: 'modrinth', label: 'Modrinth' },
  { value: 'curseforge', label: 'CurseForge' },
]);

async function submit() {
  if (!sourceId.value.trim()) return;
  pending.value = true;
  try {
    const { id } = await anticheatActions.createProject({
      source: source.value,
      sourceId: sourceId.value.trim(),
      kind: props.kind,
      decision: props.decision,
    });
    toast.add({
      title: t(`admin.anticheat.project.done.${props.decision}`),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', id);
  } catch (error) {
    const problem = error instanceof AnticheatError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.anticheat.errors.${problem}`),
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
    :title="t(`admin.anticheat.project.title.${decision}`)"
    :description="t(`admin.anticheat.project.body.${decision}`)"
    :close="false"
  >
    <template #body>
      <form id="anticheat-project" class="flex flex-col gap-4" @submit.prevent="submit">
        <UFormField :label="t('admin.anticheat.project.source')">
          <USelect v-model="source" :items="sources" class="w-full" />
        </UFormField>
        <UFormField
          :label="t('admin.anticheat.project.id')"
          :help="t(`admin.anticheat.project.idHelp.${source}`)"
        >
          <UInput v-model="sourceId" class="w-full" autofocus />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('admin.anticheat.cancel')"
          @click="emit('close', null)"
        />
        <UButton
          v-if="decision === 'banned'"
          type="submit"
          form="anticheat-project"
          color="error"
          variant="outline"
          :loading="pending"
          :disabled="!sourceId.trim()"
          :label="t('admin.anticheat.project.confirm.banned')"
        />
        <UButton
          v-else
          type="submit"
          form="anticheat-project"
          :loading="pending"
          :disabled="!sourceId.trim()"
          :label="t('admin.anticheat.project.confirm.approved')"
        />
      </div>
    </template>
  </UModal>
</template>
