<script setup lang="ts">
// Confirms revoking a key. Closes with true once it is revoked, or false.
const props = defineProps<{ id: string; name: string }>();
const emit = defineEmits<{ close: [revoked: boolean] }>();

const { t, locale } = useI18n();
const toast = useToast();
const { data } = useAdminApiKey(props.id);
const pending = ref(false);

const usage = computed(() => {
  if (!data.value?.lastUsedAt) return t('admin.apiKeys.revoke.neverUsed');
  return t('admin.apiKeys.revoke.lastUsed', {
    when: formatWardenRelative(data.value.lastUsedAt, locale.value),
    calls: data.value.calls7d,
  });
});

async function onRevoke() {
  pending.value = true;
  try {
    await apiKeyActions.revoke(props.id);
    toast.add({
      title: t('admin.apiKeys.revoke.done'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    const problem = error instanceof ApiKeyError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.apiKeys.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    pending.value = false;
  }
}
</script>

<template>
  <UModal
    :title="t('admin.apiKeys.revoke.title', { name })"
    :description="t('admin.apiKeys.revoke.lede')"
    :close="false"
  >
    <template #body>
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-info"
        :description="usage"
        class="tabular-nums"
      />
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('admin.cancel')"
          @click="emit('close', false)"
        />
        <UButton
          color="error"
          variant="outline"
          :loading="pending"
          :label="t('admin.apiKeys.revoke.confirm')"
          @click="onRevoke"
        />
      </div>
    </template>
  </UModal>
</template>
