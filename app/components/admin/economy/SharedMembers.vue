<script setup lang="ts">
import type { EconomyAdminAccountDetail } from '#shared/schemas/economy';

// Who is in the shared account and in what role. Each member opens their Person page.
defineProps<{ account: EconomyAdminAccountDetail }>();
const { t, locale } = useI18n();
</script>

<template>
  <p v-if="!account.members.length" class="rounded-lg bg-elevated px-6 py-8 text-center text-muted">
    {{ t('admin.economy.account.noMembers') }}
  </p>
  <ul v-else class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
    <li v-for="member in account.members" :key="member.userId">
      <NuxtLink
        :to="`/admin/people/${encodeURIComponent(member.userId)}/summary`"
        class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-accented/40"
      >
        <span class="flex min-w-48 flex-1 flex-col">
          <span class="font-semibold text-highlighted">{{
            member.name ?? member.username ?? member.userId
          }}</span>
          <span v-if="member.username" class="text-sm text-muted">{{ member.username }}</span>
        </span>
        <UBadge
          color="neutral"
          variant="soft"
          size="sm"
          :label="t(`economy.roles.${member.role}`)"
        />
        <span class="w-40 text-right text-sm text-muted">{{
          t('admin.economy.account.joined', { date: formatWardenDate(member.joinedAt, locale) })
        }}</span>
      </NuxtLink>
    </li>
  </ul>
</template>
