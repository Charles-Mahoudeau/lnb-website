<script setup lang="ts">
import { DOWNLOAD_OSES } from '#shared/schemas/downloads';
import type { DownloadOs } from '#shared/schemas/downloads';

// "Other systems" under a download: closed by default, then one button per other system. A system
// without a link (a slot nobody has filled) is left out.
const props = defineProps<{
  current: DownloadOs;
  links: Partial<Record<DownloadOs, string | undefined>>;
  external?: boolean;
}>();

const { t } = useI18n();
const open = ref(false);
const others = computed(() =>
  DOWNLOAD_OSES.filter((os) => os !== props.current && props.links[os]),
);
</script>

<template>
  <div v-if="others.length" class="flex flex-col items-start gap-2">
    <UButton
      color="neutral"
      variant="ghost"
      size="md"
      :label="open ? t('download.hideOtherSystems') : t('download.otherSystems')"
      :aria-expanded="open"
      @click="open = !open"
    />
    <div v-if="open" class="flex flex-wrap gap-2">
      <UButton
        v-for="os in others"
        :key="os"
        :to="props.links[os]"
        :target="external ? '_blank' : undefined"
        external
        color="neutral"
        variant="outline"
        size="md"
        :icon="external ? 'i-lucide-external-link' : 'i-lucide-download'"
        :label="t(`download.systems.${os}`)"
      />
    </div>
  </div>
</template>
