<script setup lang="ts">
// Asks before a decision on a file or project, with an optional note kept in its history.
// Bans confirm with the outline destructive button, the rest with the solid one.
defineProps<{ title: string; body: string; label: string; destructive?: boolean }>();
const emit = defineEmits<{ close: [result: { note: string | undefined } | null] }>();

const { t } = useI18n();
const note = ref('');
const submit = () => {
  emit('close', { note: note.value.trim() || undefined });
};
</script>

<template>
  <UModal :title="title" :description="body" :close="false">
    <template #body>
      <UFormField :label="t('admin.anticheat.note.optional')">
        <UTextarea v-model="note" :rows="2" :maxlength="500" autoresize class="w-full" />
      </UFormField>
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
          :color="destructive ? 'error' : 'primary'"
          :variant="destructive ? 'outline' : 'solid'"
          :label="label"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
