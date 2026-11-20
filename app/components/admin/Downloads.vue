<script setup lang="ts">
import { downloadSettingsBody } from '#shared/schemas/downloads';
import type { DownloadSlot } from '#shared/schemas/downloads';

// The files the Minecraft download page offers, picked from the Files library: the LNB instance zip
// and PrismCracked for each system. Java 21 and Prism link to their own sites. See
// docs/downloads.md.
const { t, locale } = useI18n();
const toast = useToast();
const { isEnabled } = useFlags();

const { data, error, refresh } = await useAdminDownloads();
const { data: library } = await useAdminFiles();

// The library files a slot can hold.
const choices = computed(() =>
  (library.value?.items ?? [])
    .filter((file) => file.kind === 'download')
    .map((file) => ({
      value: file.id,
      label: `${file.name} (${formatBytes(file.size, locale.value)})`,
    })),
);

const picked = reactive<Record<string, string | undefined>>({});
const versions = reactive<Record<string, string>>({});
const busy = ref<DownloadSlot | null>(null);

function syncForm() {
  for (const row of data.value?.slots ?? []) {
    picked[row.slot] = row.file?.id;
    versions[row.slot] = row.file?.version ?? '';
  }
}
syncForm();

// The link to PrismCracked's releases, saved apart from the files.
const releaseUrl = ref(data.value?.crackedReleaseUrl ?? '');
const releaseValid = computed(
  () => downloadSettingsBody.safeParse({ crackedReleaseUrl: releaseUrl.value }).success,
);
const releaseUnchanged = computed(
  () => releaseUrl.value.trim() === (data.value?.crackedReleaseUrl ?? ''),
);
const savingRelease = ref(false);

async function saveRelease() {
  savingRelease.value = true;
  try {
    await downloadActions.setSettings({ crackedReleaseUrl: releaseUrl.value });
    toast.add({
      title: t('admin.downloads.saved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (failure) {
    toast.add({
      title: t(`admin.downloads.errors.${downloadProblem(failure)}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
  releaseUrl.value = data.value?.crackedReleaseUrl ?? '';
  savingRelease.value = false;
}

const slots = computed(() => data.value?.slots ?? []);

function changed(slot: DownloadSlot) {
  const current = slots.value.find((item) => item.slot === slot)?.file;
  if (!picked[slot]) return false;
  const savedVersion = current ? (current.version ?? '') : '';
  return picked[slot] !== current?.id || (versions[slot] ?? '').trim() !== savedVersion;
}

async function run(slot: DownloadSlot, action: () => Promise<unknown>, done: string) {
  busy.value = slot;
  try {
    await action();
    toast.add({ title: t(done), color: 'success', icon: 'i-lucide-circle-check' });
  } catch (failure) {
    toast.add({
      title: t(`admin.downloads.errors.${downloadProblem(failure)}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
  syncForm();
  busy.value = null;
}

const save = (slot: DownloadSlot) =>
  run(
    slot,
    () => downloadActions.set(slot, { fileId: picked[slot]!, version: versions[slot] || null }),
    'admin.downloads.saved',
  );
const empty = (slot: DownloadSlot) =>
  run(slot, () => downloadActions.clear(slot), 'admin.downloads.emptied');
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.downloads.loadFailed')"
  />
  <div v-else class="flex max-w-4xl flex-col gap-6">
    <p class="text-muted">{{ t('admin.downloads.note') }}</p>
    <UAlert
      v-if="!isEnabled('downloads')"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="t('admin.downloads.flagOff')"
    />
    <div
      v-if="choices.length === 0"
      class="flex flex-wrap items-center gap-3 rounded-lg bg-elevated p-5"
    >
      <IconTile icon="i-lucide-download" />
      <p class="min-w-0 flex-1 text-muted">{{ t('admin.downloads.noFiles') }}</p>
      <UButton
        to="/admin/modpack/files"
        color="neutral"
        variant="soft"
        :label="t('admin.downloads.openFiles')"
      />
    </div>

    <section class="rounded-lg bg-elevated px-5">
      <form
        v-for="row in slots"
        :key="row.slot"
        class="flex flex-col gap-3 border-t border-default py-5 first:border-t-0"
        @submit.prevent="save(row.slot)"
      >
        <div class="flex flex-col gap-1">
          <h2 class="text-base font-semibold text-highlighted">
            {{ t(`admin.downloads.slots.${row.slot}`) }}
          </h2>
          <p class="text-sm text-muted">
            {{ row.file ? row.file.name : t('admin.downloads.nothing') }}
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <UFormField :label="t('admin.downloads.file')" class="min-w-64 flex-1">
            <USelect
              v-model="picked[row.slot]"
              :items="choices"
              :placeholder="t('admin.downloads.choose')"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.downloads.version')" class="w-36">
            <UInput v-model="versions[row.slot]" maxlength="40" class="w-full" />
          </UFormField>
          <UButton
            type="submit"
            color="neutral"
            variant="soft"
            :label="t('admin.downloads.save')"
            :disabled="!changed(row.slot)"
            :loading="busy === row.slot"
          />
          <UButton
            v-if="row.file"
            color="neutral"
            variant="ghost"
            :label="t('admin.downloads.empty')"
            :disabled="busy === row.slot"
            @click="empty(row.slot)"
          />
        </div>
      </form>
    </section>

    <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h2 class="text-base font-semibold text-highlighted">
        {{ t('admin.downloads.release.title') }}
      </h2>
      <p class="text-sm text-muted">{{ t('admin.downloads.release.help') }}</p>
      <form class="flex flex-wrap items-start gap-3" @submit.prevent="saveRelease">
        <UFormField
          :label="t('admin.downloads.release.label')"
          name="crackedReleaseUrl"
          class="min-w-64 flex-1"
          :error="releaseValid ? undefined : t('admin.downloads.release.invalid')"
        >
          <UInput v-model="releaseUrl" type="url" class="w-full" />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="soft"
          class="mt-6"
          :label="t('admin.downloads.save')"
          :disabled="releaseUnchanged || !releaseValid"
          :loading="savingRelease"
        />
      </form>
    </section>
  </div>
</template>
