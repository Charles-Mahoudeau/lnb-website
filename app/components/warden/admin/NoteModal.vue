<script setup lang="ts">
import type { WardenNoteBody } from '#shared/schemas/warden';

// A private note, or a warning the player sees. Closes with the note to send, or null. `kind` is
// the one picked at first: the header has both an "Add a note" and a "Warn" button.
const props = withDefaults(defineProps<{ kind?: WardenNoteBody['kind'] }>(), { kind: 'note' });
const emit = defineEmits<{ close: [note: WardenNoteBody | null] }>();

const { t } = useI18n();
const kind = ref<WardenNoteBody['kind']>(props.kind);
const body = ref('');
const ruleIds = ref<string[]>([]);

// Only a warning can name rules: a private note is just for admins.
function submit() {
  if (!body.value.trim()) return;
  emit('close', {
    kind: kind.value,
    body: body.value.trim(),
    ruleIds: kind.value === 'warning' ? ruleIds.value : [],
  });
}

const kinds = computed(() => [
  { label: t('wardenAdmin.noteModal.note'), value: 'note' },
  { label: t('wardenAdmin.noteModal.warning'), value: 'warning' },
]);
</script>

<template>
  <UModal :title="t('wardenAdmin.noteModal.title')" :close="false">
    <template #body>
      <form id="warden-note" class="flex flex-col gap-5" @submit.prevent="submit">
        <URadioGroup v-model="kind" :items="kinds" />
        <UFormField :label="t('wardenAdmin.noteModal.body')" required>
          <UTextarea v-model="body" :rows="3" :maxlength="2000" autoresize class="w-full" />
        </UFormField>
        <RulesPicker v-if="kind === 'warning'" v-model="ruleIds" />
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('wardenAdmin.noteModal.cancel')"
          @click="emit('close', null)"
        />
        <UButton
          type="submit"
          form="warden-note"
          :label="t('wardenAdmin.noteModal.submit')"
          :disabled="!body.trim()"
        />
      </div>
    </template>
  </UModal>
</template>
