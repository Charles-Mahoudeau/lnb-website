<script setup lang="ts">
import { adminGhostBody } from '#shared/schemas/admin';
import type { AdminGhost } from '#shared/schemas/admin';

// The form that makes a ghost account (docs/ghost-accounts.md), in the Users modal and in the
// pickers. Events managers go through their own route, admins through theirs. Emits the account
// once it's made, and shows the API's refusal itself.
const props = withDefaults(defineProps<{ via?: 'admin' | 'events'; id?: string }>(), {
  via: 'admin',
  id: 'ghost-form',
});
const emit = defineEmits<{ created: [ghost: AdminGhost]; pending: [pending: boolean] }>();

const { t } = useI18n();
const actions = useAdminUserActions();

const state = reactive({ name: '', email: '', tenantId: '' });
const failure = ref<string>();

const schoolItems = Object.entries(SCHOOLS).map(([value, label]) => ({ label, value }));

async function onSubmit() {
  failure.value = undefined;
  emit('pending', true);
  try {
    const body = { name: state.name, email: state.email, tenantId: state.tenantId };
    emit(
      'created',
      await (props.via === 'events' ? createEventGhost(body) : actions.createGhost(body)),
    );
  } catch (error) {
    const problem = error instanceof AdminError ? error.problem : 'failed';
    failure.value = t(`admin.errors.${problem === 'emailTaken' ? problem : 'failed'}`);
  } finally {
    emit('pending', false);
  }
}
</script>

<template>
  <UForm
    :id="id"
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
      <USelect
        v-model="state.tenantId"
        :items="schoolItems"
        :placeholder="t('admin.ghost.schoolPlaceholder')"
        class="w-full"
      />
    </UFormField>
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="t('admin.ghost.warning')"
    />
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />
  </UForm>
</template>
