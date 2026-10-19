<script setup lang="ts">
import type { ModAdminRow } from '#shared/schemas/mods';
import { REASON_MAX } from '#shared/schemas/mods';

// Changes a mod's reason (it can be emptied) and who gets the credit. Closes with true once saved.
const props = defineProps<{ mod: ModAdminRow }>();
const emit = defineEmits<{ close: [saved: boolean] }>();

const { t } = useI18n();
const toast = useToast();

interface Option {
  userId: string;
  name: string;
  email: string;
}

const reason = ref(props.mod.reason ?? '');
const current: Option | null = props.mod.proposer;
// The picked account, or null for nobody.
const picked = ref<Option | null>(current);
const search = ref('');
const results = ref<Option[]>([]);
const pending = ref(false);

let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, (q) => {
  clearTimeout(timer);
  if (q.trim().length < 2) return;
  timer = setTimeout(() => {
    modAdminActions
      .searchUsers(q.trim())
      .then((found) => (results.value = found))
      .catch(() => (results.value = []));
  }, 250);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
});

const items = computed(() => {
  const options = picked.value
    ? [picked.value, ...results.value.filter((o) => o.userId !== picked.value?.userId)]
    : results.value;
  return options.map((option) => ({
    label: option.name,
    description: option.email,
    value: option.userId,
  }));
});
const pickedId = computed({
  get: () => picked.value?.userId,
  set: (userId: string | undefined) => {
    picked.value =
      [picked.value, ...results.value].find((option) => option?.userId === userId) ?? null;
  },
});

const changed = computed(
  () =>
    reason.value.trim() !== (props.mod.reason ?? '') ||
    (picked.value?.userId ?? null) !== (current?.userId ?? null),
);

async function onSave() {
  pending.value = true;
  try {
    await modAdminActions.edit(props.mod.id, {
      reason: reason.value,
      proposerUserId: picked.value?.userId ?? null,
    });
    toast.add({
      title: t('admin.mods.edit.saved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    const problem = error instanceof ModError ? error.problem : 'failed';
    toast.add({
      title: t(`mods.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <UModal
    :title="t('admin.mods.edit.title', { name: props.mod.name })"
    :description="t('admin.mods.edit.lede')"
    :close="false"
  >
    <template #body>
      <form id="mods-edit" class="flex flex-col gap-5" @submit.prevent="onSave">
        <UFormField
          :label="t('admin.mods.edit.reason')"
          :help="t('admin.mods.edit.reasonHelp')"
          name="reason"
        >
          <UTextarea v-model="reason" :rows="3" :maxlength="REASON_MAX" autoresize class="w-full" />
        </UFormField>
        <UFormField
          :label="t('admin.mods.edit.proposer')"
          :help="t('admin.mods.edit.proposerHelp')"
          name="proposer"
        >
          <div class="flex gap-2">
            <USelectMenu
              v-model="pickedId"
              v-model:search-term="search"
              :items="items"
              value-key="value"
              ignore-filter
              icon="i-lucide-search"
              :placeholder="t('admin.mods.edit.nobody')"
              class="w-full"
            />
            <UButton
              v-if="picked"
              color="neutral"
              variant="soft"
              icon="i-lucide-x"
              :aria-label="t('admin.mods.edit.clearProposer')"
              @click="picked = null"
            />
          </div>
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('mods.cancel')"
          :disabled="pending"
          @click="emit('close', false)"
        />
        <UButton
          type="submit"
          form="mods-edit"
          :label="t('admin.mods.edit.submit')"
          :disabled="!changed"
          :loading="pending"
        />
      </div>
    </template>
  </UModal>
</template>
