<script setup lang="ts">
// A SHA-512 in the body font, shortened to its first 10 and last 4 characters, with a ghost
// copy button that copies the whole hash. Never monospace (docs/design.md).
const props = defineProps<{ sha512: string }>();
const { t } = useI18n();
const toast = useToast();

const short = computed(() => `${props.sha512.slice(0, 10)}…${props.sha512.slice(-4)}`);

async function copy() {
  await navigator.clipboard.writeText(props.sha512);
  toast.add({
    title: t('admin.anticheat.hash.copied'),
    color: 'success',
    icon: 'i-lucide-circle-check',
  });
}
</script>

<template>
  <span class="inline-flex items-center gap-1">
    <span class="tabular-nums" :title="sha512">{{ short }}</span>
    <UButton
      icon="i-lucide-copy"
      size="xs"
      color="neutral"
      variant="ghost"
      :aria-label="t('admin.anticheat.hash.copy')"
      @click="copy"
    />
  </span>
</template>
