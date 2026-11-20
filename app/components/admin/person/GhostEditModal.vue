<script setup lang="ts">
import { adminGhostBody } from '#shared/schemas/admin';
import type { AdminGhost } from '#shared/schemas/admin';

// Changes a ghost's name, email or school. Closes with the account, or null.
const props = defineProps<{
  userId: string;
  ghost: { name: string; email: string; tenantId: string };
}>();
const emit = defineEmits<{ close: [ghost: AdminGhost | null] }>();

const { t } = useI18n();
const actions = useAdminUserActions();

const state = reactive({ ...props.ghost });
const pending = ref(false);
const failure = ref<string>();
const schoolItems = Object.entries(SCHOOLS).map(([value, label]) => ({ label, value }));

async function onSubmit() {
  failure.value = undefined;
  pending.value = true;
  try {
    emit('close', await actions.updateGhost(props.userId, { ...state }));
  } catch (error) {
    const problem = error instanceof AdminError ? error.problem : 'failed';
    const known = ['emailTaken', 'notGhost', 'notFound'];
    failure.value = t(`admin.errors.${known.includes(problem) ? problem : 'failed'}`);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <UModal :title="t('admin.person.ghostEdit.title')" :close="false">
    <template #body>
      <UForm
        id="admin-ghost-edit"
        :schema="adminGhostBody"
        :state="state"
        class="flex flex-col gap-5"
        @submit="onSubmit"
      >
        <UFormField :label="t('admin.ghost.name')" name="name" required>
          <UInput v-model="state.name" :maxlength="100" autocomplete="off" class="w-full" />
        </UFormField>
        <UFormField
          :label="t('admin.ghost.email')"
          :help="t('admin.ghost.emailHelp')"
          name="email"
          required
        >
          <UInput v-model="state.email" type="email" autocomplete="off" class="w-full" />
        </UFormField>
        <UFormField :label="t('admin.ghost.school')" name="tenantId" required>
          <USelect v-model="state.tenantId" :items="schoolItems" class="w-full" />
        </UFormField>
        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="failure"
        />
      </UForm>
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
          form="admin-ghost-edit"
          :loading="pending"
          :label="t('admin.person.ghostEdit.submit')"
        />
      </div>
    </template>
  </UModal>
</template>
