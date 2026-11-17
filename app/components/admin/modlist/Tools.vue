<script setup lang="ts">
import { AdminModlistToolPublish } from '#components';

import { FILE_KIND_ICONS } from '#shared/schemas/files';
import { MODPACK_TOOLS } from '#shared/schemas/modpack';
import type { ModpackTool, ModpackToolView } from '#shared/schemas/modpack';

// The launcher's two jars, each with the file that is current. Publishing opens a modal; a
// rollback is the same modal with an older file. See docs/modpack.md.
const props = defineProps<{ tools: ModpackToolView[] }>();
const emit = defineEmits<{ changed: [] }>();

const { t, d, locale } = useI18n();
const overlay = useOverlay();
const publishing = overlay.create(AdminModlistToolPublish);

const ICONS: Record<ModpackTool, string> = {
  launcher: FILE_KIND_ICONS.wrapper,
  updater: FILE_KIND_ICONS.updater,
};

const cards = computed(() =>
  MODPACK_TOOLS.map((tool) => ({ tool, current: props.tools.find((item) => item.tool === tool) })),
);

/** The start and end of a hash, enough to tell two files apart at a glance. */
const shortHash = (hash: string) => `${hash.slice(0, 8)}…${hash.slice(-6)}`;

async function onPublish(tool: ModpackTool) {
  const done: unknown = await publishing.open({
    tool,
    current: props.tools.find((item) => item.tool === tool),
  }).result;
  if (done === true) emit('changed');
}
</script>

<template>
  <div class="grid gap-2 md:grid-cols-2">
    <article
      v-for="{ tool, current } in cards"
      :key="tool"
      class="flex flex-col gap-3 rounded-lg bg-elevated p-5"
    >
      <header class="flex items-center gap-3">
        <IconTile :icon="ICONS[tool]" />
        <div class="min-w-0">
          <h3 class="text-base">{{ t(`admin.modlist.tools.${tool}.name`) }}</h3>
          <p class="text-sm text-muted">{{ t(`admin.modlist.tools.${tool}.blurb`) }}</p>
        </div>
      </header>
      <template v-if="current">
        <p class="font-display text-2xl text-highlighted tabular-nums">{{ current.version }}</p>
        <dl class="flex flex-col gap-1 text-sm">
          <div class="flex gap-4">
            <dt class="w-20 shrink-0 text-muted">{{ t('admin.modlist.tools.file') }}</dt>
            <dd class="min-w-0 break-words">
              {{ current.fileName }} · {{ formatBytes(current.size, locale) }}
            </dd>
          </div>
          <div class="flex gap-4">
            <dt class="w-20 shrink-0 text-muted">SHA-256</dt>
            <dd class="font-mono text-xs break-all">{{ shortHash(current.sha256) }}</dd>
          </div>
          <div class="flex gap-4">
            <dt class="w-20 shrink-0 text-muted">{{ t('admin.modlist.tools.published') }}</dt>
            <dd>
              {{
                t('admin.modlist.tools.publishedBy', {
                  date: d(current.publishedAt, { dateStyle: 'medium', timeZone: 'Europe/Paris' }),
                  name: current.publishedBy ?? t('admin.modlist.tools.someone'),
                })
              }}
            </dd>
          </div>
          <div v-if="current.notes" class="flex gap-4">
            <dt class="w-20 shrink-0 text-muted">{{ t('admin.modlist.tools.notes') }}</dt>
            <dd class="break-words">{{ current.notes }}</dd>
          </div>
        </dl>
      </template>
      <p v-else class="rounded-md border border-dashed border-default p-3 text-sm text-muted">
        {{ t('admin.modlist.tools.none') }}
      </p>
      <div>
        <UButton
          :color="current ? 'neutral' : 'primary'"
          :variant="current ? 'soft' : 'solid'"
          size="md"
          icon="i-lucide-upload"
          :label="
            current ? t('admin.modlist.tools.publishNew') : t('admin.modlist.tools.publishFirst')
          "
          @click="onPublish(tool)"
        />
      </div>
    </article>
  </div>
</template>
