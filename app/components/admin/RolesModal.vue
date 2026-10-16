<script setup lang="ts">
import type { AdminRolesBody } from '#shared/schemas/admin';

// Every role of an account, at once. Closes with the roles to save, or null.
const props = defineProps<{ name: string; roles: AdminRolesBody; self: boolean }>();
const emit = defineEmits<{ close: [roles: AdminRolesBody | null] }>();

const { t } = useI18n();

const admin = ref(props.roles.admin);
const wardenAdmin = ref(props.roles.wardenAdmin);
const eventsManager = ref(props.roles.eventsManager);
const changed = computed(
  () =>
    admin.value !== props.roles.admin ||
    wardenAdmin.value !== props.roles.wardenAdmin ||
    eventsManager.value !== props.roles.eventsManager,
);
</script>

<template>
  <UModal :title="t('admin.rolesModal.title', { name })" :close="false">
    <template #body>
      <div class="flex flex-col gap-5">
        <USwitch
          v-model="admin"
          :disabled="self"
          :label="t('admin.roles.admin')"
          :description="self ? t('admin.rolesModal.self') : t('admin.rolesModal.adminHint')"
        />
        <USwitch
          v-model="wardenAdmin"
          :label="t('admin.roles.wardenAdmin')"
          :description="t('admin.rolesModal.wardenAdminHint')"
        />
        <USwitch
          v-model="eventsManager"
          :label="t('admin.roles.eventsManager')"
          :description="t('admin.rolesModal.eventsManagerHint')"
        />
      </div>
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
          :label="t('admin.rolesModal.save')"
          :disabled="!changed"
          @click="emit('close', { admin, wardenAdmin, eventsManager })"
        />
      </div>
    </template>
  </UModal>
</template>
