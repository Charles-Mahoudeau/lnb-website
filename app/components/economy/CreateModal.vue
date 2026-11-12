<script setup lang="ts">
import type { EconomyAccountDetail, EconomyCreateBody } from '#shared/schemas/economy';
import { ECONOMY_ACCOUNT_TYPES, economyCreateBody } from '#shared/schemas/economy';

// Opening a shared account. Closes with the new account, or null. A casino needs a free casino
// licence, bought in the game.
const props = defineProps<{ freeLicenses: number }>();
const emit = defineEmits<{ close: [account: EconomyAccountDetail | null] }>();
const { t } = useI18n();

const state = reactive<EconomyCreateBody>({ name: '', handle: '', type: 'team' });
const typeItems = computed(() =>
  ECONOMY_ACCOUNT_TYPES.map((value) => ({
    label: t(`economy.types.${value}`),
    value,
    disabled: value === 'casino' && props.freeLicenses < 1,
  })),
);
const handleTouched = ref(false);
// The handle follows the name until the player edits it.
watch(
  () => state.name,
  (name) => {
    if (handleTouched.value) return;
    state.handle = name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z\d]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
  },
);

const problem = ref<string | null>(null);
const saving = ref(false);
async function onSubmit() {
  saving.value = true;
  problem.value = null;
  try {
    emit('close', await economyActions.create({ ...state }));
  } catch (caught) {
    problem.value = caught instanceof EconomyError ? caught.problem : 'failed';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UModal :title="t('economy.create.title')" :description="t('economy.create.lede')" :close="false">
    <template #body>
      <UForm
        id="economy-create"
        :schema="economyCreateBody"
        :state="state"
        class="flex flex-col gap-5"
        @submit="onSubmit"
      >
        <UFormField name="name" :label="t('economy.create.name')">
          <UInput v-model="state.name" class="w-full" maxlength="32" autofocus />
        </UFormField>
        <UFormField
          name="handle"
          :label="t('economy.create.handle')"
          :help="t('economy.create.handleHelp')"
        >
          <UInput
            v-model="state.handle"
            class="w-full"
            maxlength="25"
            autocomplete="off"
            @input="handleTouched = true"
          >
            <template #leading><span class="text-muted">#</span></template>
          </UInput>
        </UFormField>
        <UFormField
          name="type"
          :label="t('economy.create.type')"
          :help="t('economy.create.typeHelp', { n: freeLicenses }, freeLicenses)"
        >
          <USelect v-model="state.type" :items="typeItems" value-key="value" class="w-full" />
        </UFormField>
        <UAlert
          v-if="problem"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="t(`economy.errors.${problem}`)"
        />
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('economy.cancel')"
          @click="emit('close', null)"
        />
        <UButton
          type="submit"
          form="economy-create"
          :loading="saving"
          :label="t('economy.create.submit')"
        />
      </div>
    </template>
  </UModal>
</template>
