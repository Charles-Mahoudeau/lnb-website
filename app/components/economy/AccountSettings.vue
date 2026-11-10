<script setup lang="ts">
import { WardenConfirmModal } from '#components';

import type { EconomyAccountView } from '#shared/schemas/economy';

// Settings of the chosen account: the baltop for the personal one; the name, closing or leaving
// for a shared one.
const props = defineProps<{ account: EconomyAccountView; hideFromBaltop: boolean }>();
const emit = defineEmits<{ changed: []; closed: []; failed: [caught: unknown] }>();
const { t } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const { user } = useAuth();
const { isEnabled } = useFlags();
const confirm = overlay.create(WardenConfirmModal);

async function run(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
    return true;
  } catch (caught) {
    emit('failed', caught);
    return false;
  }
}

async function onBaltop(hidden: boolean) {
  const done = await run(
    () => economyActions.updateMe({ hideFromBaltop: hidden }),
    hidden ? t('economy.settings.baltopHidden') : t('economy.settings.baltopShown'),
  );
  if (done) emit('changed');
}

const name = ref(props.account.name ?? '');
const renaming = ref(false);
async function onRename() {
  renaming.value = true;
  if (
    await run(
      () => economyActions.rename(props.account.id, name.value),
      t('economy.settings.renamed'),
    )
  ) {
    emit('changed');
  }
  renaming.value = false;
}

async function ask(title: string, description: string, confirmLabel: string): Promise<boolean> {
  const confirmed: unknown = await confirm.open({
    title,
    description,
    confirmLabel,
    cancelLabel: t('economy.cancel'),
    destructive: true,
  }).result;
  return confirmed === true;
}

async function onClose() {
  const name = props.account.name ?? '';
  if (
    !(await ask(
      t('economy.settings.closeTitle', { name }),
      t('economy.settings.closeBody'),
      t('economy.settings.close'),
    ))
  )
    return;
  if (await run(() => economyActions.close(props.account.id), t('economy.settings.closed'))) {
    emit('changed');
    emit('closed');
  }
}

async function onLeave() {
  const name = props.account.name ?? '';
  if (
    !(await ask(
      t('economy.settings.leaveTitle', { name }),
      t('economy.settings.leaveBody'),
      t('economy.settings.leave'),
    ))
  )
    return;
  if (
    await run(
      () => economyActions.removeMember(props.account.id, user.value?.id ?? ''),
      t('economy.settings.left'),
    )
  ) {
    emit('changed');
    emit('closed');
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <section v-if="account.kind === 'personal'" class="rounded-lg bg-elevated p-6">
      <USwitch
        :model-value="hideFromBaltop"
        :disabled="!isEnabled('economy.baltop')"
        :label="t('economy.settings.hideFromBaltop')"
        :description="t('economy.settings.hideFromBaltopHint')"
        @update:model-value="onBaltop"
      />
    </section>

    <template v-else>
      <form
        v-if="account.role === 'owner'"
        class="flex flex-col gap-4 rounded-lg bg-elevated p-6"
        @submit.prevent="onRename"
      >
        <UFormField
          :label="t('economy.settings.name')"
          :hint="t('economy.settings.handleFixed', { handle: account.handle })"
        >
          <UInput v-model="name" class="w-full max-w-sm" maxlength="32" />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="soft"
          class="self-start"
          :loading="renaming"
          :disabled="!name.trim() || name.trim() === account.name"
          :label="t('economy.settings.rename')"
        />
      </form>

      <section class="flex flex-col items-start gap-3 rounded-lg bg-elevated p-6">
        <template v-if="account.role === 'owner'">
          <h3 class="font-sans text-base font-semibold text-highlighted">
            {{ t('economy.settings.closeHeading') }}
          </h3>
          <p class="text-sm text-muted">
            {{
              account.balance > 0
                ? t('economy.settings.closeNotEmpty')
                : t('economy.settings.closeHint')
            }}
          </p>
          <UButton
            color="error"
            variant="outline"
            :disabled="account.balance > 0"
            :label="t('economy.settings.close')"
            @click="onClose"
          />
        </template>
        <template v-else>
          <h3 class="font-sans text-base font-semibold text-highlighted">
            {{ t('economy.settings.leaveHeading') }}
          </h3>
          <p class="text-sm text-muted">{{ t('economy.settings.leaveHint') }}</p>
          <UButton
            color="error"
            variant="outline"
            :label="t('economy.settings.leave')"
            @click="onLeave"
          />
        </template>
      </section>
    </template>
  </div>
</template>
