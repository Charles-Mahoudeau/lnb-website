<script setup lang="ts">
import { MODPACK_SIDES } from '#shared/schemas/modpack';
import type { ModpackFile, ModpackModView } from '#shared/schemas/modpack';

// One mod in a side drawer: what the manifest lists now, the newest file found, its details, a
// switch to a Files library jar, and remove. Closes with 'changed' when something was saved, so
// the list refreshes.
const props = defineProps<{ mod: ModpackModView }>();
const emit = defineEmits<{ close: ['changed' | null] }>();

const { t, d, locale } = useI18n();
const toast = useToast();

const typed = computed(() => props.mod.source === 'url' || props.mod.source === 'upload');
const form = reactive({
  name: props.mod.name,
  side: props.mod.side,
  optional: props.mod.optional,
  version: props.mod.pinned?.version ?? '',
});
const dirty = computed(
  () =>
    form.name !== props.mod.name ||
    form.side !== props.mod.side ||
    form.optional !== props.mod.optional ||
    (typed.value && form.version !== (props.mod.pinned?.version ?? '')),
);
const sideItems = computed(() =>
  MODPACK_SIDES.map((value) => ({ value, label: t(`admin.modlist.sides.${value}`) })),
);

const pending = ref(false);
const changed = ref(false);
const confirming = ref(false);
const switching = ref(false);
const pick = reactive({ fileId: '', version: props.mod.pinned?.version ?? '' });

const { data: library } = await useAdminFiles();
const jarItems = computed(() =>
  (library.value?.items ?? [])
    .filter((file) => file.kind === 'mod')
    .map((file) => ({
      value: file.id,
      label: `${file.name} · ${formatBytes(file.size, locale.value)}`,
    })),
);

async function run(action: () => Promise<unknown>, done: string) {
  pending.value = true;
  try {
    await action();
    toast.add({ title: t(done), color: 'success', icon: 'i-lucide-circle-check' });
    return true;
  } catch (error) {
    const problem = error instanceof ModpackError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.modlist.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    return false;
  } finally {
    pending.value = false;
  }
}

async function onSave() {
  const body = {
    name: form.name,
    side: form.side,
    optional: form.optional,
    ...(typed.value ? { version: form.version } : {}),
  };
  if (await run(() => modpackActions.edit(props.mod.id, body), 'admin.modlist.saved')) {
    emit('close', 'changed');
  }
}

async function onSwitch() {
  if (
    await run(
      () => modpackActions.pinFile(props.mod.id, { fileId: pick.fileId, version: pick.version }),
      'admin.modlist.switched',
    )
  ) {
    emit('close', 'changed');
  }
}

async function onRemove() {
  if (await run(() => modpackActions.remove(props.mod.id), 'admin.modlist.removed')) {
    emit('close', 'changed');
  }
  confirming.value = false;
}

const shortHash = (hash: string | null) => (hash ? `${hash.slice(0, 16)}…` : null);
const statusColor = { ok: 'success', update: 'warning', attention: 'error' } as const;
</script>

<template>
  <USlideover
    :title="mod.name"
    :close="{ onClick: () => emit('close', changed ? 'changed' : null) }"
    @update:open="(open: boolean) => !open && emit('close', null)"
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            color="neutral"
            variant="outline"
            size="md"
            :label="t(`admin.modlist.sources.${mod.source}`)"
          />
          <UBadge
            color="neutral"
            variant="outline"
            size="md"
            :label="t(`admin.modlist.sides.${mod.side}`)"
          />
          <UBadge
            :color="statusColor[mod.status]"
            variant="soft"
            size="md"
            :label="t(`admin.modlist.status.${mod.status}`)"
          />
        </div>

        <UAlert
          v-if="mod.attention"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="t(`admin.modlist.attention.${mod.attention}`)"
        />

        <section
          v-for="block in [
            { key: 'now', file: mod.pinned as ModpackFile | null },
            { key: 'latest', file: mod.latest as ModpackFile | null },
          ]"
          :key="block.key"
          class="flex flex-col gap-2"
        >
          <h3 class="font-sans text-base font-semibold text-highlighted">
            {{ t(`admin.modlist.detail.${block.key}`) }}
          </h3>
          <div v-if="block.file" class="flex flex-col gap-1 rounded-md bg-default px-3 py-2.5">
            <span class="font-semibold tabular-nums">
              {{ block.file.version }}
              <span v-if="block.file.size" class="font-normal text-muted">
                · {{ formatBytes(block.file.size, locale) }}
              </span>
            </span>
            <code v-if="block.file.sha512" class="font-mono text-sm break-all text-muted">
              sha512 {{ shortHash(block.file.sha512) }}
            </code>
            <span class="text-sm text-muted">
              {{
                block.file.url?.startsWith('/')
                  ? t('admin.modlist.detail.fromLibrary')
                  : t('admin.modlist.detail.fromSource')
              }}
            </span>
          </div>
          <p v-else-if="block.key === 'now'" class="text-muted">
            {{ t('admin.modlist.detail.noFile') }}
          </p>
          <p v-else class="text-muted">
            {{
              mod.latestCheckedAt
                ? t('admin.modlist.detail.noLatest')
                : t('admin.modlist.detail.notChecked')
            }}
          </p>
          <p v-if="block.key === 'latest' && mod.latestCheckedAt" class="text-sm text-muted">
            {{
              t('admin.modlist.detail.checked', {
                date: d(mod.latestCheckedAt, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Europe/Paris',
                }),
              })
            }}
          </p>
        </section>

        <form class="flex flex-col gap-4" @submit.prevent="onSave">
          <h3 class="font-sans text-base font-semibold text-highlighted">
            {{ t('admin.modlist.detail.details') }}
          </h3>
          <UFormField :label="t('admin.modlist.add.name')" name="name">
            <UInput v-model="form.name" :maxlength="80" class="w-full" />
          </UFormField>
          <UFormField v-if="typed" :label="t('admin.modlist.add.version')" name="version">
            <UInput v-model="form.version" :maxlength="40" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.modlist.side')" name="side">
            <USelect v-model="form.side" :items="sideItems" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('admin.modlist.optional')"
            :help="t('admin.modlist.optionalHelp')"
            name="optional"
          >
            <USwitch v-model="form.optional" />
          </UFormField>
          <div>
            <UButton
              type="submit"
              color="neutral"
              variant="soft"
              :label="t('admin.modlist.detail.save')"
              :disabled="!dirty"
              :loading="pending"
            />
          </div>
        </form>

        <section class="flex flex-col gap-3">
          <h3 class="font-sans text-base font-semibold text-highlighted">
            {{ t('admin.modlist.detail.switchTitle') }}
          </h3>
          <p class="text-sm text-muted">{{ t('admin.modlist.detail.switchHelp') }}</p>
          <div v-if="!switching">
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-box"
              :label="t('admin.modlist.detail.switch')"
              @click="switching = true"
            />
          </div>
          <form v-else class="flex flex-col gap-3" @submit.prevent="onSwitch">
            <USelect
              v-model="pick.fileId"
              :items="jarItems"
              :placeholder="t('admin.modlist.add.pickFile')"
              :aria-label="t('admin.modlist.add.file')"
              class="w-full"
            />
            <UInput
              v-model="pick.version"
              :maxlength="40"
              :placeholder="t('admin.modlist.add.version')"
              :aria-label="t('admin.modlist.add.version')"
              required
              class="w-full"
            />
            <p v-if="!jarItems.length" class="text-sm text-muted">
              {{ t('admin.modlist.add.noJars') }}
            </p>
            <div class="flex gap-2">
              <UButton
                type="submit"
                :label="t('admin.modlist.detail.switchApply')"
                :disabled="!pick.fileId || !pick.version"
                :loading="pending"
              />
              <UButton
                color="neutral"
                variant="ghost"
                :label="t('mods.cancel')"
                @click="switching = false"
              />
            </div>
          </form>
        </section>

        <UAlert
          v-if="confirming"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('admin.modlist.detail.removeConfirm', { name: mod.name })"
          :description="t('admin.modlist.detail.removeNote')"
          :actions="[
            {
              label: t('admin.modlist.detail.removeYes'),
              color: 'error',
              loading: pending,
              onClick: onRemove,
            },
            {
              label: t('mods.cancel'),
              color: 'neutral',
              variant: 'ghost',
              onClick: () => {
                confirming = false;
              },
            },
          ]"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton
          color="error"
          variant="outline"
          icon="i-lucide-trash-2"
          :label="t('admin.modlist.detail.remove')"
          @click="confirming = true"
        />
      </div>
    </template>
  </USlideover>
</template>
