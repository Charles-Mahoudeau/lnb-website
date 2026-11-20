<script setup lang="ts">
import type { EconomyAccountType, EconomyAdminAccountDetail } from '#shared/schemas/economy';
import { ECONOMY_ACCOUNT_TYPES } from '#shared/schemas/economy';

// The account's type and its casino license. Admins set any type with no license, to tag the
// casinos that were there before the licenses. Giving or taking back a license is done on the
// owner's LNBits tab, since licenses belong to a person.
const props = defineProps<{ account: EconomyAdminAccountDetail }>();
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();
const toast = useToast();

const typeItems = computed(() =>
  ECONOMY_ACCOUNT_TYPES.map((value) => ({ label: t(`economy.types.${value}`), value })),
);

async function onType(type: EconomyAccountType) {
  if (type === props.account.type) return;
  try {
    await economyAdminActions.setType(props.account.id, type);
    toast.add({
      title: t('admin.economy.account.typeSaved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('changed');
  } catch (caught) {
    const problem = caught instanceof EconomyError ? caught.problem : 'failed';
    toast.add({
      title: t(`economy.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}

const owner = computed(() => props.account.members.find((member) => member.role === 'owner'));
</script>

<template>
  <div class="flex flex-col gap-4">
    <section
      class="flex flex-wrap items-center gap-4 rounded-lg bg-elevated px-6 py-5"
      aria-labelledby="admin-economy-shared-type"
    >
      <div class="flex min-w-64 flex-1 flex-col gap-1">
        <h2 id="admin-economy-shared-type" class="text-sm font-semibold text-muted">
          {{ t('admin.economy.account.type') }}
        </h2>
        <span class="text-sm text-muted">{{ t('admin.economy.account.typeHint') }}</span>
      </div>
      <USelect
        v-if="account.type && !account.closed"
        :model-value="account.type"
        :items="typeItems"
        value-key="value"
        :aria-label="t('admin.economy.account.type')"
        class="w-36"
        @update:model-value="onType"
      />
      <UBadge
        v-else-if="account.type"
        color="neutral"
        variant="soft"
        :label="t(`economy.types.${account.type}`)"
      />
    </section>

    <section class="flex flex-col gap-1 rounded-lg bg-elevated px-6 py-5">
      <h2 class="text-sm font-semibold text-muted">{{ t('admin.economy.account.licenses') }}</h2>
      <template v-if="account.casinoLicense">
        <span class="text-highlighted">
          {{
            t('admin.economy.account.licenseBound', {
              name: account.casinoLicense.name ?? account.casinoLicense.userId,
              date: account.casinoLicense.boundAt
                ? formatWardenDate(account.casinoLicense.boundAt, locale)
                : '—',
            })
          }}
        </span>
        <NuxtLink
          :to="`/admin/people/${encodeURIComponent(account.casinoLicense.userId)}/lnbits`"
          class="text-sm text-muted underline"
        >
          {{ t('admin.economy.account.licenseOwner') }}
        </NuxtLink>
      </template>
      <template v-else>
        <span class="text-highlighted">{{ t('admin.economy.account.noLicense') }}</span>
        <NuxtLink
          v-if="owner"
          :to="`/admin/people/${encodeURIComponent(owner.userId)}/lnbits`"
          class="text-sm text-muted underline"
        >
          {{ t('admin.economy.account.licenseOwner') }}
        </NuxtLink>
      </template>
    </section>
  </div>
</template>
