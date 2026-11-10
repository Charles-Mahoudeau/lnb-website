<script setup lang="ts">
import type { EconomyAdjustBody } from '#shared/schemas/economy';
import { economyAdjustBody } from '#shared/schemas/economy';

// Mint or burn on one account, with a reason its members see. Closes with the body, or null.
const props = defineProps<{ label: string; balance: number; direction: 'mint' | 'burn' }>();
const emit = defineEmits<{ close: [body: EconomyAdjustBody | null] }>();
const { t, locale } = useI18n();

const state = reactive<{ direction: 'mint' | 'burn'; amount?: number; reason: string }>({
  direction: props.direction,
  amount: undefined,
  reason: '',
});
const after = computed(() => {
  const amount = state.amount ?? 0;
  return state.direction === 'mint' ? props.balance + amount : props.balance - amount;
});
const directions = ['mint', 'burn'] as const;

function onSubmit() {
  const body = economyAdjustBody.safeParse(state);
  if (body.success) emit('close', body.data);
}
</script>

<template>
  <UModal
    :title="t('admin.economy.adjust.title', { name: label })"
    :description="t('admin.economy.adjust.lede')"
    :close="false"
  >
    <template #body>
      <UForm
        id="economy-adjust"
        :schema="economyAdjustBody"
        :state="state"
        class="flex flex-col gap-5"
        @submit="onSubmit"
      >
        <div
          class="flex gap-1 rounded-md bg-accented p-1"
          role="group"
          :aria-label="t('admin.economy.adjust.direction')"
        >
          <UButton
            v-for="option in directions"
            :key="option"
            type="button"
            size="md"
            block
            color="neutral"
            :variant="state.direction === option ? 'soft' : 'outline'"
            :aria-pressed="state.direction === option"
            :label="t(`admin.economy.adjust.${option}`)"
            @click="state.direction = option"
          />
        </div>
        <UFormField name="amount" :label="t('admin.economy.adjust.amount')">
          <UInputNumber v-model="state.amount" :min="1" :step="1" class="w-full" />
        </UFormField>
        <UFormField
          name="reason"
          :label="t('admin.economy.adjust.reason')"
          :help="t('admin.economy.adjust.reasonHelp')"
        >
          <UInput v-model="state.reason" class="w-full" maxlength="140" />
        </UFormField>
        <div class="flex justify-between gap-3 rounded-md bg-accented px-4 py-3">
          <span class="text-muted">{{ t('admin.economy.adjust.after') }}</span>
          <span class="tabular-nums">
            <span class="text-muted">{{ formatLnbits(balance, locale) }}</span>
            {{ t('admin.economy.adjust.to') }}
            <strong :class="after < 0 ? 'text-error' : 'text-highlighted'">{{
              formatLnbits(after, locale)
            }}</strong>
          </span>
        </div>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('admin.cancel')"
          @click="emit('close', null)"
        />
        <UButton
          type="submit"
          form="economy-adjust"
          :disabled="!state.amount || after < 0"
          :label="
            t(`admin.economy.adjust.submit.${state.direction}`, {
              amount: formatLnbits(state.amount ?? 0, locale),
            })
          "
        />
      </div>
    </template>
  </UModal>
</template>
