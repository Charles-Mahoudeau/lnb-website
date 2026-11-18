<script setup lang="ts">
import { PACKAGE_COMMANDS, PACKAGE_DISTROS } from '#shared/schemas/downloads';
import type { DownloadOs, PackageDistro, PackageEntry } from '#shared/schemas/downloads';

// Install with the system's package manager: Homebrew on macOS, one chip per distribution on
// Linux. Windows has none. The command is only shown, never run. It is set in the body font on
// purpose: docs/design.md allows no monospace face.
const props = defineProps<{ tool: 'java' | 'prism'; os: DownloadOs }>();
const distro = defineModel<PackageDistro>('distro', { default: 'ubuntu' });

const { t } = useI18n();
const toast = useToast();

const entry = computed<PackageEntry | null>(() => {
  const commands = PACKAGE_COMMANDS[props.tool];
  if (props.os === 'macos') {
    return typeof commands.macos === 'string' ? { command: commands.macos } : commands.macos;
  }
  if (props.os === 'linux') return commands.linux[distro.value];
  return null;
});

const copied = ref(false);
async function copy() {
  if (!entry.value) return;
  try {
    await navigator.clipboard.writeText(entry.value.command);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    toast.add({ title: t('download.packages.copyFailed'), color: 'error' });
  }
}
</script>

<template>
  <div v-if="entry" class="flex w-full flex-col gap-3">
    <h3 class="font-sans text-base font-semibold text-highlighted">
      {{ t(os === 'macos' ? 'download.packages.macos' : 'download.packages.linux') }}
    </h3>
    <div
      v-if="os === 'linux'"
      class="flex flex-wrap gap-2"
      role="group"
      :aria-label="t('download.packages.distro')"
    >
      <UButton
        v-for="name in PACKAGE_DISTROS"
        :key="name"
        size="md"
        class="rounded-full"
        :color="name === distro ? 'secondary' : 'neutral'"
        :variant="name === distro ? 'soft' : 'outline'"
        :aria-pressed="name === distro"
        :label="t(`download.packages.distros.${name}`)"
        @click="distro = name"
      />
    </div>
    <div class="flex items-center gap-2 rounded-md bg-accented py-1.5 pr-1.5 pl-3.5">
      <span class="min-w-0 flex-1 wrap-anywhere">{{ entry.command }}</span>
      <UButton
        color="neutral"
        variant="soft"
        size="md"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        :label="copied ? t('download.packages.copied') : t('download.packages.copy')"
        @click="copy"
      />
    </div>
    <p v-if="entry.note" class="text-sm text-muted">
      {{ t(`download.packages.notes.${entry.note}`) }}
    </p>
  </div>
</template>
