<script setup lang="ts">
// The player's personal server address, hidden until they choose to show it, so it doesn't
// leak on a shared screen or a stream.
const props = defineProps<{ serverUrl: string; tokenRotatedAt: string }>();
const emit = defineEmits<{ regenerate: [] }>();

const { t, locale } = useI18n();
const toast = useToast();

const shown = ref(false);
const masked = computed(() => {
  const [token = '', ...host] = props.serverUrl.split('.');
  return `${'•'.repeat(token.length)}.${host.join('.')}`;
});

async function copy() {
  try {
    await navigator.clipboard.writeText(props.serverUrl);
    toast.add({ title: t('warden.address.copied'), color: 'success', icon: 'i-lucide-copy-check' });
  } catch {
    shown.value = true;
    toast.add({
      title: t('warden.address.copyFailed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}
</script>

<template>
  <section class="flex flex-col gap-4" aria-labelledby="warden-address">
    <h2 id="warden-address" class="text-2xl font-medium text-highlighted">
      {{ t('warden.address.title') }}
    </h2>
    <div class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <p class="text-sm text-muted">{{ t('warden.address.help') }}</p>
      <div class="flex flex-wrap gap-2">
        <UInput
          :model-value="shown ? serverUrl : masked"
          readonly
          :aria-label="t('warden.address.label')"
          :ui="{ base: shown ? 'tabular-nums' : 'text-muted tabular-nums' }"
          class="min-w-0 flex-1 basis-72"
        />
        <UButton
          color="neutral"
          variant="soft"
          :icon="shown ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          :label="shown ? t('warden.address.hide') : t('warden.address.show')"
          @click="shown = !shown"
        />
        <UButton icon="i-lucide-copy" :label="t('warden.address.copy')" @click="copy" />
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span class="text-sm text-muted">
          {{ t('warden.address.created', { date: formatWardenDate(tokenRotatedAt, locale) }) }}
        </span>
        <UButton
          color="neutral"
          variant="outline"
          size="md"
          icon="i-lucide-rotate-cw"
          :label="t('warden.address.regenerate')"
          @click="emit('regenerate')"
        />
      </div>
    </div>
  </section>
</template>
