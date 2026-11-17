<script setup lang="ts">
import { FILE_KIND_ICONS, kindsFor } from '#shared/schemas/files';
import type { FileKind, FileView } from '#shared/schemas/files';

// One file in a side drawer: its type, links and hashes, what uses it, and delete. Closes with
// 'deleted' or 'changed' when the admin deleted it or changed its type, so the library refreshes.
const props = defineProps<{ file: FileView }>();
const emit = defineEmits<{ close: ['deleted' | 'changed' | null] }>();

const { t, d, locale } = useI18n();
const toast = useToast();
const origin = useRequestURL().origin;

const fullUrl = computed(() => origin + props.file.url);
const inUse = computed(() => props.file.usedBy.length > 0);
const confirming = ref(false);
const kind = ref<FileKind>(props.file.kind);
const kindItems = computed(() =>
  kindsFor(props.file.name).map((value) => ({ value, label: t(`admin.files.kinds.${value}`) })),
);
const kindPending = ref(false);
const pending = ref(false);

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ title: t('admin.files.copied'), color: 'success', icon: 'i-lucide-circle-check' });
  } catch {
    toast.add({
      title: t('admin.files.errors.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}

async function onKind() {
  kindPending.value = true;
  try {
    await fileActions.setKind(props.file.id, kind.value);
    toast.add({
      title: t('admin.files.detail.kindChanged'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', 'changed');
  } catch (error) {
    const problem = error instanceof FileError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.files.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    kindPending.value = false;
  }
}

async function onDelete() {
  pending.value = true;
  try {
    await fileActions.remove(props.file.id);
    toast.add({ title: t('admin.files.deleted'), color: 'success', icon: 'i-lucide-circle-check' });
    emit('close', 'deleted');
  } catch (error) {
    const problem = error instanceof FileError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.files.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    confirming.value = false;
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <USlideover
    :title="file.name"
    :close="{ onClick: () => emit('close', null) }"
    @update:open="(open: boolean) => !open && emit('close', null)"
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <div class="flex flex-wrap items-center gap-2">
          <IconTile :icon="FILE_KIND_ICONS[file.kind]" />
          <UBadge
            color="neutral"
            variant="outline"
            size="md"
            :label="t(`admin.files.kinds.${file.kind}`)"
          />
          <span class="text-sm text-muted tabular-nums">{{ formatBytes(file.size, locale) }}</span>
        </div>

        <section class="flex flex-col gap-2">
          <h3 class="font-sans text-base font-semibold text-highlighted">
            {{ t('admin.files.detail.kindTitle') }}
          </h3>
          <p class="text-sm text-muted">{{ t('admin.files.detail.kindHelp') }}</p>
          <div class="flex flex-wrap items-center gap-2">
            <USelect
              v-model="kind"
              :items="kindItems"
              :disabled="inUse || kindItems.length < 2"
              :aria-label="t('admin.files.detail.kindTitle')"
              class="w-56"
            />
            <UButton
              color="neutral"
              variant="soft"
              :label="t('admin.files.detail.kindSave')"
              :disabled="kind === file.kind || inUse"
              :loading="kindPending"
              @click="onKind"
            />
          </div>
          <p v-if="inUse" class="text-sm text-muted">{{ t('admin.files.detail.kindLocked') }}</p>
          <p v-else-if="kindItems.length < 2" class="text-sm text-muted">
            {{ t('admin.files.detail.kindOnly') }}
          </p>
        </section>

        <section class="flex flex-col gap-2">
          <h3 class="font-sans text-base font-semibold text-highlighted">
            {{ t('admin.files.detail.link') }}
          </h3>
          <div class="flex items-center gap-2 rounded-md bg-default py-1.5 pr-1.5 pl-3">
            <code class="min-w-0 flex-1 font-mono text-sm break-all">{{ fullUrl }}</code>
            <UButton
              icon="i-lucide-copy"
              color="neutral"
              variant="ghost"
              :aria-label="t('admin.files.copy')"
              @click="copy(fullUrl)"
            />
          </div>
        </section>

        <section
          v-for="algorithm in ['sha256', 'sha512'] as const"
          :key="algorithm"
          class="flex flex-col gap-2"
        >
          <h3 class="font-sans text-base font-semibold text-highlighted">
            {{ algorithm === 'sha256' ? 'SHA-256' : 'SHA-512' }}
          </h3>
          <div class="flex items-center gap-2 rounded-md bg-default py-1.5 pr-1.5 pl-3">
            <code class="min-w-0 flex-1 font-mono text-sm break-all">{{ file[algorithm] }}</code>
            <UButton
              icon="i-lucide-copy"
              color="neutral"
              variant="ghost"
              :aria-label="t('admin.files.copy')"
              @click="copy(file[algorithm])"
            />
          </div>
        </section>

        <section class="flex flex-col gap-2">
          <h3 class="font-sans text-base font-semibold text-highlighted">
            {{ t('admin.files.detail.usedBy') }}
          </h3>
          <ul v-if="inUse" class="flex flex-col divide-y divide-default rounded-md bg-default px-3">
            <li v-for="use in file.usedBy" :key="use" class="py-2.5">{{ use }}</li>
          </ul>
          <p v-else class="text-muted">{{ t('admin.files.detail.unused') }}</p>
        </section>

        <p class="text-sm text-muted">
          {{
            file.uploadedBy
              ? t('admin.files.detail.uploaded', {
                  date: d(file.uploadedAt, { dateStyle: 'medium', timeZone: 'Europe/Paris' }),
                  name: file.uploadedBy,
                })
              : t('admin.files.detail.uploadedNoName', {
                  date: d(file.uploadedAt, { dateStyle: 'medium', timeZone: 'Europe/Paris' }),
                })
          }}
        </p>

        <UAlert
          v-if="inUse"
          color="warning"
          variant="subtle"
          icon="i-lucide-info"
          :description="t('admin.files.detail.inUseNote')"
        />
        <UAlert
          v-else-if="confirming"
          color="error"
          variant="subtle"
          icon="i-lucide-trash-2"
          :description="t('admin.files.detail.deleteConfirm')"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center gap-3">
        <UButton
          :to="file.url"
          external
          target="_blank"
          color="neutral"
          variant="soft"
          icon="i-lucide-download"
          :label="t('admin.files.detail.download')"
        />
        <span class="flex-1" />
        <template v-if="confirming">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('admin.files.detail.cancel')"
            @click="confirming = false"
          />
          <UButton
            color="error"
            variant="outline"
            icon="i-lucide-trash-2"
            :loading="pending"
            :label="t('admin.files.detail.delete')"
            @click="onDelete"
          />
        </template>
        <UButton
          v-else
          color="error"
          variant="outline"
          icon="i-lucide-trash-2"
          :disabled="inUse"
          :label="t('admin.files.detail.delete')"
          @click="confirming = true"
        />
      </div>
    </template>
  </USlideover>
</template>
