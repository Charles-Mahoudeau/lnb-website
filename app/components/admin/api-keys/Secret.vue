<script setup lang="ts">
// Shows a new key once, with a copy button. The server keeps only a hash, so closing it is final.
const props = defineProps<{ name: string; secret: string; overlapDays?: number }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const copied = ref(false);

async function copy() {
  try {
    await navigator.clipboard.writeText(props.secret);
    copied.value = true;
  } catch {
    // The field below is selectable, so the key can still be copied by hand.
  }
}
</script>

<template>
  <UModal
    :title="t('admin.apiKeys.secret.title')"
    :description="
      overlapDays
        ? t('admin.apiKeys.secret.ledeRotated', {
            name,
            days: t('admin.apiKeys.rotate.days', { n: overlapDays }, overlapDays),
          })
        : t('admin.apiKeys.secret.lede', { name })
    "
    :close="false"
    :dismissible="false"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-2 rounded-md bg-default p-2 pl-4">
          <code class="min-w-0 flex-1 font-mono text-sm break-all select-all">{{ secret }}</code>
          <UButton
            color="neutral"
            variant="soft"
            size="md"
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            :label="copied ? t('admin.apiKeys.secret.copied') : t('admin.apiKeys.secret.copy')"
            @click="copy"
          />
        </div>
        <p class="text-sm text-muted">{{ t('admin.apiKeys.secret.usage') }}</p>
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-info"
          :description="t('admin.apiKeys.secret.warning')"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton :label="t('admin.apiKeys.secret.done')" @click="emit('close')" />
      </div>
    </template>
  </UModal>
</template>
