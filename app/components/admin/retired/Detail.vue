<script setup lang="ts">
import type { ModpackRetiredPlayers, ModpackRetiredView } from '#shared/schemas/modpack';

// One retired file in a side drawer: its name, hash and note, what the manifest lists, and the
// players who still have it. Closes with 'changed' when something was saved or removed.
const props = defineProps<{ item: ModpackRetiredView; counted: boolean }>();
const emit = defineEmits<{ close: ['changed' | null] }>();

const { t, locale } = useI18n();
const toast = useToast();

const form = reactive({
  fileName: props.item.fileName,
  sha512: props.item.sha512 ?? '',
  note: props.item.note,
});
const dirty = computed(
  () =>
    form.fileName !== props.item.fileName ||
    form.sha512.trim().toLowerCase() !== (props.item.sha512 ?? '') ||
    form.note !== props.item.note,
);
const pending = ref(false);
const confirming = ref(false);

const players = ref<ModpackRetiredPlayers | null>(null);
if (props.counted && props.item.players) {
  try {
    players.value = await modpackActions.retiredPlayers(props.item.id);
  } catch {
    // The list is a convenience: the count above stays.
  }
}

async function run(action: () => Promise<unknown>, done: string) {
  pending.value = true;
  try {
    await action();
    toast.add({ title: t(done), color: 'success', icon: 'i-lucide-circle-check' });
    emit('close', 'changed');
  } catch (error) {
    const problem = error instanceof ModpackError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.retired.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
    confirming.value = false;
  }
}

const onSave = () =>
  run(
    () =>
      modpackActions.editRetired(props.item.id, {
        fileName: form.fileName,
        sha512: form.sha512.trim() ? form.sha512 : null,
        note: form.note,
      }),
    'admin.retired.saved',
  );
const onRemove = () =>
  run(() => modpackActions.removeRetired(props.item.id), 'admin.retired.removed');

const manifestLine = computed(
  () =>
    `{ "fileName": "${props.item.fileName}"${props.item.sha512 ? `, "sha512": "${props.item.sha512.slice(0, 12)}…"` : ''} }`,
);
</script>

<template>
  <USlideover
    :title="item.fileName"
    :close="{ onClick: () => emit('close', null) }"
    @update:open="(open: boolean) => !open && emit('close', null)"
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            color="neutral"
            variant="outline"
            size="md"
            :label="t(item.sha512 ? 'admin.retired.exact' : 'admin.retired.byName')"
          />
          <UBadge
            v-if="item.safeToDrop"
            color="success"
            variant="soft"
            size="md"
            :label="t('admin.retired.status.safe')"
          />
        </div>

        <form class="flex flex-col gap-4" @submit.prevent="onSave">
          <UFormField :label="t('admin.retired.detail.fileName')" name="fileName">
            <UInput v-model="form.fileName" :maxlength="255" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('admin.retired.detail.sha512')"
            :help="t('admin.retired.detail.sha512Help')"
            name="sha512"
          >
            <UInput v-model="form.sha512" :maxlength="128" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('admin.retired.detail.note')"
            :help="t('admin.retired.detail.noteHelp')"
            name="note"
          >
            <UInput v-model="form.note" :maxlength="300" class="w-full" />
          </UFormField>
          <p class="rounded-md bg-default px-3 py-2.5 text-sm break-all text-muted">
            {{ t('admin.retired.detail.manifest') }}
            <span class="font-semibold text-highlighted">{{ manifestLine }}</span>
          </p>
          <div class="flex justify-end">
            <UButton
              type="submit"
              :label="t('admin.retired.detail.save')"
              :disabled="!dirty"
              :loading="pending"
            />
          </div>
        </form>

        <section class="flex flex-col gap-2">
          <h3 class="font-sans text-base font-semibold text-highlighted">
            {{ t('admin.retired.detail.players') }}
          </h3>
          <p v-if="!counted" class="text-muted">{{ t('admin.retired.notCountedShort') }}</p>
          <p v-else-if="!item.players" class="text-muted">
            {{
              item.zeroDays !== null
                ? t('admin.retired.detail.nobody', { count: item.zeroDays })
                : t('admin.retired.detail.nobodyYet')
            }}
          </p>
          <ul v-else-if="players" class="flex flex-col divide-y divide-default">
            <li
              v-for="person in players.items"
              :key="person.userId"
              class="flex items-center gap-3 py-2"
            >
              <UserAvatar :user-id="person.userId" :name="person.name" size="sm" />
              <span class="min-w-0 flex-1">
                <span class="block font-semibold break-words text-highlighted">{{
                  person.name
                }}</span>
                <span class="block text-sm text-muted">
                  {{
                    t('admin.retired.detail.lastReport', {
                      when: formatWardenRelative(person.lastReportAt, locale),
                    })
                  }}
                </span>
              </span>
              <UButton
                color="neutral"
                variant="ghost"
                size="md"
                trailing-icon="i-lucide-arrow-right"
                :label="t('admin.retired.detail.anticheat')"
                :to="`/admin/people/${person.userId}/anticheat`"
              />
            </li>
          </ul>
          <p v-if="players && players.total > players.items.length" class="text-sm text-muted">
            {{ t('admin.retired.detail.more', { count: players.total - players.items.length }) }}
          </p>
        </section>

        <div class="flex flex-col gap-2 border-t border-default pt-4">
          <template v-if="!confirming">
            <UButton
              color="error"
              variant="outline"
              icon="i-lucide-trash-2"
              :label="t('admin.retired.detail.remove')"
              class="self-start"
              @click="confirming = true"
            />
          </template>
          <template v-else>
            <p class="text-sm text-muted">{{ t('admin.retired.detail.removeConfirm') }}</p>
            <div class="flex gap-2">
              <UButton
                color="error"
                variant="outline"
                :label="t('admin.retired.detail.removeYes')"
                :loading="pending"
                @click="onRemove"
              />
              <UButton
                color="neutral"
                variant="ghost"
                :label="t('admin.retired.detail.cancel')"
                @click="confirming = false"
              />
            </div>
          </template>
        </div>
      </div>
    </template>
  </USlideover>
</template>
