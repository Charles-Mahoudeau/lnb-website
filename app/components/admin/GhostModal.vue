<script setup lang="ts">
import type { AdminGhost } from '#shared/schemas/admin';

// Makes a ghost account from the Users list. Closes with the account, or null.
const emit = defineEmits<{ close: [ghost: AdminGhost | null] }>();

const { t } = useI18n();
const pending = ref(false);
</script>

<template>
  <UModal
    :title="t('admin.ghost.modalTitle')"
    :description="t('admin.ghost.modalLede')"
    :close="false"
  >
    <template #body>
      <AdminGhostForm
        id="admin-ghost"
        @pending="pending = $event"
        @created="emit('close', $event)"
      />
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
          type="submit"
          form="admin-ghost"
          :loading="pending"
          :label="t('admin.ghost.submit')"
        />
      </div>
    </template>
  </UModal>
</template>
