<script setup lang="ts">
import { API_KEY_EXPIRY_CHOICES, API_KEY_GROUPS, permissionMessageKey } from '#shared/api-keys';
import type { ApiKeyPermission } from '#shared/api-keys';
import { apiKeyBody } from '#shared/schemas/api-keys';
import type { ApiKeyCreated } from '#shared/schemas/api-keys';

// Makes an API key in a side drawer. Closes with the created key and its secret, or null.
const emit = defineEmits<{ close: [created: ApiKeyCreated | null] }>();

const { t } = useI18n();
const toast = useToast();

const state = reactive({
  name: '',
  description: '',
  expiresInDays: 365,
  permissions: [] as ApiKeyPermission[],
});
const pending = ref(false);

function toggle(permission: ApiKeyPermission, on: boolean) {
  const index = state.permissions.indexOf(permission);
  if (on && index === -1) state.permissions.push(permission);
  if (!on && index > -1) state.permissions.splice(index, 1);
}

function groupFull(permissions: readonly ApiKeyPermission[]) {
  return permissions.every((permission) => state.permissions.includes(permission));
}

function toggleGroup(permissions: readonly ApiKeyPermission[]) {
  const full = groupFull(permissions);
  for (const permission of permissions) toggle(permission, !full);
}

const expiryItems: ComputedRef<{ value: number; label: string }[]> = computed(() =>
  API_KEY_EXPIRY_CHOICES.map((days) => ({
    value: days,
    label: t(`admin.apiKeys.form.expiryChoices.${String(days)}`),
  })),
);

const ready = computed(() => state.name.trim().length > 0 && state.permissions.length > 0);

async function onSubmit() {
  if (!ready.value) return;
  pending.value = true;
  try {
    const created = await apiKeyActions.create({ ...state });
    toast.add({
      title: t('admin.apiKeys.form.created'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', created);
  } catch (error) {
    const problem = error instanceof ApiKeyError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.apiKeys.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <USlideover
    :title="t('admin.apiKeys.form.title')"
    :close="{ onClick: () => emit('close', null) }"
    @update:open="(open: boolean) => !open && emit('close', null)"
  >
    <template #body>
      <UForm
        id="api-key-form"
        :schema="apiKeyBody"
        :state="state"
        class="flex flex-col gap-6"
        @submit="onSubmit"
      >
        <UFormField
          :label="t('admin.apiKeys.form.name')"
          name="name"
          :help="t('admin.apiKeys.form.nameHelp')"
          required
        >
          <UInput
            v-model="state.name"
            :maxlength="80"
            :placeholder="t('admin.apiKeys.form.namePlaceholder')"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.apiKeys.form.description')"
          name="description"
          :hint="t('admin.apiKeys.form.optional')"
        >
          <UTextarea
            v-model="state.description"
            :rows="2"
            :maxlength="300"
            autoresize
            :placeholder="t('admin.apiKeys.form.descriptionPlaceholder')"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.apiKeys.form.expires')"
          name="expiresInDays"
          :help="t('admin.apiKeys.form.expiresHelp')"
        >
          <USelect v-model="state.expiresInDays" :items="expiryItems" class="w-full" />
        </UFormField>

        <fieldset class="flex flex-col gap-3">
          <legend class="mb-1 text-sm font-medium">
            {{ t('admin.apiKeys.form.permissions') }}
            <span class="font-normal text-muted tabular-nums">
              · {{ t('admin.apiKeys.form.selected', { n: state.permissions.length }) }}
            </span>
          </legend>

          <section
            v-for="group in API_KEY_GROUPS"
            :key="group.id"
            class="flex flex-col gap-3 rounded-lg bg-default p-4"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <h3 class="font-sans text-base font-semibold text-highlighted">
                  {{ t(`admin.apiKeys.groups.${group.id}.label`) }}
                </h3>
                <p class="text-sm text-muted">
                  {{ t(`admin.apiKeys.groups.${group.id}.description`) }}
                </p>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                size="md"
                :label="
                  t(
                    groupFull(group.permissions)
                      ? 'admin.apiKeys.form.clear'
                      : 'admin.apiKeys.form.selectAll',
                  )
                "
                @click="toggleGroup(group.permissions)"
              />
            </div>
            <div class="flex flex-col divide-y divide-default">
              <UCheckbox
                v-for="permission in group.permissions"
                :key="permission"
                class="py-3"
                :model-value="state.permissions.includes(permission)"
                :label="t(`admin.apiKeys.permissions.${permissionMessageKey(permission)}.label`)"
                :description="
                  t(`admin.apiKeys.permissions.${permissionMessageKey(permission)}.description`)
                "
                @update:model-value="
                  (on: boolean | 'indeterminate') => toggle(permission, on === true)
                "
              >
                <template #description>
                  <span class="block">
                    {{
                      t(`admin.apiKeys.permissions.${permissionMessageKey(permission)}.description`)
                    }}
                  </span>
                  <code class="mt-1 block font-mono text-xs text-muted">{{ permission }}</code>
                </template>
              </UCheckbox>
            </div>
          </section>
        </fieldset>

        <UAlert
          color="neutral"
          variant="soft"
          icon="i-lucide-shield"
          :description="t('admin.apiKeys.form.blocked')"
        />
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="outline"
          :label="t('admin.cancel')"
          @click="emit('close', null)"
        />
        <UButton
          type="submit"
          form="api-key-form"
          :loading="pending"
          :disabled="!ready"
          :label="t('admin.apiKeys.form.create')"
        />
      </div>
    </template>
  </USlideover>
</template>
