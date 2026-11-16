<script setup lang="ts">
import { AdminFilesDetail } from '#components';

import { FILE_KIND_ICONS, FILE_KINDS, MAX_FILE_BYTES } from '#shared/schemas/files';
import type { FileKind, FileView } from '#shared/schemas/files';

// The Files library: the numbers, a drop area with an upload queue, then the files. A file
// opens in a side drawer. See docs/files.md.
const { t, d, locale } = useI18n();
const toast = useToast();
const origin = useRequestURL().origin;
const picker = useTemplateRef<HTMLInputElement>('picker');
// The page's button opens the file picker.
defineExpose({ choose: () => picker.value?.click() });
const { data, error, refresh } = await useAdminFiles();

const overlay = useOverlay();
const detail = overlay.create(AdminFilesDetail);

interface QueueItem {
  id: number;
  file: File;
  kind: FileKind;
  status: 'waiting' | 'uploading' | 'done' | 'error';
  progress: number;
  problem?: string;
}

const queue = ref<QueueItem[]>([]);
const dragging = ref(false);
const kindChoice = ref<'auto' | FileKind>('auto');
let nextId = 0;
let running = false;

const kindItems = computed(() => [
  { value: 'auto', label: t('admin.files.kinds.auto') },
  ...FILE_KINDS.map((value) => ({ value, label: t(`admin.files.kinds.${value}`) })),
]);

function enqueue(files: File[]) {
  for (const file of files) {
    const item: QueueItem = {
      id: nextId++,
      file,
      kind: kindChoice.value === 'auto' ? defaultFileKind(file.name) : kindChoice.value,
      status: 'waiting',
      progress: 0,
    };
    if (file.size > MAX_FILE_BYTES) {
      item.status = 'error';
      item.problem = 'fileTooLarge';
    }
    queue.value.push(item);
  }
  void run();
}

// One at a time, so a few big jars don't compete for the connection.
async function run() {
  if (running) return;
  running = true;
  try {
    for (let item = queue.value.find((i) => i.status === 'waiting'); item;) {
      item.status = 'uploading';
      const current = item;
      try {
        await fileActions.upload(current.file, current.kind, (ratio) => {
          current.progress = Math.round(ratio * 100);
        });
        current.status = 'done';
      } catch (caught) {
        current.status = 'error';
        current.problem = caught instanceof FileError ? caught.problem : 'failed';
      }
      await refresh();
      item = queue.value.find((i) => i.status === 'waiting');
    }
  } finally {
    running = false;
  }
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement;
  enqueue([...(input.files ?? [])]);
  input.value = '';
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  enqueue([...(event.dataTransfer?.files ?? [])]);
}

const hasFinished = computed(() =>
  queue.value.some((item) => item.status === 'done' || item.status === 'error'),
);
function clearFinished() {
  queue.value = queue.value.filter(
    (item) => item.status === 'waiting' || item.status === 'uploading',
  );
}

const search = ref('');
const files = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (data.value?.items ?? []).filter((file) => !q || file.name.toLowerCase().includes(q));
});
const unused = computed(
  () => (data.value?.items ?? []).filter((f) => f.usedBy.length === 0).length,
);

async function onOpen(file: FileView) {
  const result: unknown = await detail.open({ file }).result;
  if (result === 'deleted') await refresh();
}

async function copy(file: FileView) {
  try {
    await navigator.clipboard.writeText(origin + file.url);
    toast.add({ title: t('admin.files.copied'), color: 'success', icon: 'i-lucide-circle-check' });
  } catch {
    toast.add({
      title: t('admin.files.errors.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.files.errors.failed')"
  />
  <div v-else class="flex max-w-5xl flex-col gap-4">
    <p class="max-w-prose text-muted">{{ t('admin.files.note') }}</p>

    <dl class="grid grid-cols-3 gap-2">
      <div class="rounded-lg bg-elevated p-4">
        <dd class="font-display text-xl text-highlighted tabular-nums">{{ data.items.length }}</dd>
        <dt class="text-sm text-muted">{{ t('admin.files.stats.files') }}</dt>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <dd class="font-display text-xl text-highlighted tabular-nums">
          {{ formatBytes(data.totalBytes, locale) }}
        </dd>
        <dt class="text-sm text-muted">{{ t('admin.files.stats.stored') }}</dt>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <dd class="font-display text-xl text-highlighted tabular-nums">{{ unused }}</dd>
        <dt class="text-sm text-muted">{{ t('admin.files.stats.unused') }}</dt>
      </div>
    </dl>

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <div
        class="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-10 text-center"
        :class="dragging ? 'border-secondary bg-secondary/10' : 'border-default'"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <IconTile icon="i-lucide-upload" />
        <p class="font-semibold text-highlighted">{{ t('admin.files.drop.title') }}</p>
        <p class="max-w-prose text-sm text-muted">
          {{ t('admin.files.drop.help', { size: formatBytes(MAX_FILE_BYTES, locale) }) }}
        </p>
        <div class="flex flex-wrap items-center justify-center gap-3">
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-folder-open"
            :label="t('admin.files.drop.choose')"
            @click="picker?.click()"
          />
          <label class="flex items-center gap-2 text-sm text-muted">
            {{ t('admin.files.drop.addAs') }}
            <USelect v-model="kindChoice" :items="kindItems" size="md" class="w-44" />
          </label>
        </div>
        <input
          ref="picker"
          type="file"
          multiple
          class="sr-only"
          :accept="FILE_ACCEPT"
          :aria-label="t('admin.files.drop.choose')"
          @change="onPick"
        />
      </div>

      <div v-if="queue.length" class="flex flex-col gap-3" aria-live="polite">
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-sans text-base font-semibold text-highlighted">
            {{ t('admin.files.queue.title') }}
          </h2>
          <UButton
            v-if="hasFinished"
            color="neutral"
            variant="ghost"
            size="md"
            :label="t('admin.files.queue.clear')"
            @click="clearFinished"
          />
        </div>
        <ul class="flex flex-col divide-y divide-default">
          <li v-for="item in queue" :key="item.id" class="flex flex-col gap-2 py-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="min-w-0 font-medium break-all">{{ item.file.name }}</span>
              <span class="flex shrink-0 items-center gap-2">
                <span class="text-sm text-muted tabular-nums">
                  {{ formatBytes(item.file.size, locale) }}
                </span>
                <UBadge
                  v-if="item.status === 'done'"
                  color="success"
                  variant="soft"
                  :label="t('admin.files.queue.added')"
                />
                <UBadge
                  v-else-if="item.status === 'error'"
                  color="error"
                  variant="soft"
                  :label="t('admin.files.queue.refused')"
                />
                <span
                  v-else-if="item.status === 'uploading'"
                  class="text-sm text-muted tabular-nums"
                >
                  {{ item.progress }}%
                </span>
                <span v-else class="text-sm text-muted">{{ t('admin.files.queue.waiting') }}</span>
              </span>
            </div>
            <UProgress
              v-if="item.status === 'uploading'"
              :model-value="item.progress"
              size="sm"
              color="neutral"
            />
            <p v-if="item.status === 'error'" class="text-sm text-muted">
              {{ t(`admin.files.errors.${item.problem ?? 'failed'}`) }}
            </p>
          </li>
        </ul>
      </div>
    </section>

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-xl font-medium text-highlighted">{{ t('admin.files.library.title') }}</h2>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          size="md"
          class="w-full max-w-xs"
          :placeholder="t('admin.files.library.search')"
          :aria-label="t('admin.files.library.search')"
        />
      </div>

      <p v-if="!data.items.length" class="text-muted">{{ t('admin.files.library.empty') }}</p>
      <p v-else-if="!files.length" class="text-muted">{{ t('admin.files.library.noMatch') }}</p>
      <ul v-else class="flex flex-col divide-y divide-default">
        <li v-for="file in files" :key="file.id" class="flex items-center gap-2">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-3 text-left hover:bg-accented/50"
            @click="onOpen(file)"
          >
            <IconTile :icon="FILE_KIND_ICONS[file.kind]" />
            <span class="min-w-0 flex-1">
              <span class="block font-semibold break-all text-highlighted">{{ file.name }}</span>
              <span class="block text-sm text-muted">
                {{
                  file.usedBy.length
                    ? t('admin.files.library.usedBy', {
                        name: file.usedBy[0],
                        count: file.usedBy.length - 1,
                      })
                    : t('admin.files.library.notUsed')
                }}
                ·
                {{ d(file.uploadedAt, { dateStyle: 'medium', timeZone: 'Europe/Paris' }) }}
              </span>
            </span>
            <UBadge
              class="hidden sm:inline-flex"
              color="neutral"
              variant="outline"
              :label="t(`admin.files.kinds.${file.kind}`)"
            />
            <span class="hidden w-20 text-right text-sm text-muted tabular-nums sm:block">
              {{ formatBytes(file.size, locale) }}
            </span>
          </button>
          <UButton
            icon="i-lucide-copy"
            size="md"
            color="neutral"
            variant="ghost"
            :aria-label="t('admin.files.copy')"
            @click="copy(file)"
          />
        </li>
      </ul>
    </section>
  </div>
</template>
