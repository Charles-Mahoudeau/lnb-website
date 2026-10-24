<script setup lang="ts">
import type { PosterView } from '#shared/schemas/posters';

// Copies a poster under a new name. Closes with the copy's id, or null.
const props = defineProps<{ poster: PosterView }>();
const emit = defineEmits<{ close: [id: string | null] }>();

const { t } = useI18n();
const toast = useToast();

const name = ref(t('admin.posters.copyName', { name: props.poster.name }).slice(0, 80));
const pending = ref(false);

async function onDuplicate() {
  if (!name.value.trim()) return;
  pending.value = true;
  try {
    const { id } = await posterActions.duplicate(props.poster.id, name.value.trim());
    toast.add({
      title: t('admin.posters.duplicated'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', id);
  } catch (error) {
    const problem = error instanceof PosterError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.posters.errors.${problem}`),
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
    :title="t('admin.posters.duplicateTitle')"
    :description="t('admin.posters.duplicateLede')"
    :close="false"
  >
    <template #body>
      <UFormField :label="t('admin.posters.fields.name')">
        <UInput v-model="name" :maxlength="80" class="w-full" @keydown.enter="onDuplicate" />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('admin.cancel')"
          @click="emit('close', null)"
        />
        <UButton
          :disabled="!name.trim()"
          :loading="pending"
          :label="t('admin.posters.duplicate')"
          @click="onDuplicate"
        />
      </div>
    </template>
  </UModal>
</template>
