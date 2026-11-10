<script setup lang="ts">
import type { EconomyInvitationView } from '#shared/schemas/economy';

// Invitations to shared accounts, waiting for the player's answer.
defineProps<{ invitations: EconomyInvitationView[] }>();
const emit = defineEmits<{ accept: [id: string]; decline: [id: string] }>();
const { t } = useI18n();
</script>

<template>
  <section
    class="flex flex-col gap-3 rounded-lg bg-elevated p-4"
    aria-labelledby="economy-invitations"
  >
    <h2 id="economy-invitations" class="font-sans text-base font-semibold text-highlighted">
      {{ t('economy.invitations.title', { n: invitations.length }, invitations.length) }}
    </h2>
    <div
      v-for="invitation in invitations"
      :key="invitation.id"
      class="flex flex-col gap-3 border-t border-default pt-3 first-of-type:border-t-0 first-of-type:pt-0"
    >
      <p class="text-sm">
        <i18n-t
          :keypath="
            invitation.invitedBy ? 'economy.invitations.body' : 'economy.invitations.bodyAnonymous'
          "
          scope="global"
        >
          <template #who>
            <strong class="text-highlighted">{{ invitation.invitedBy }}</strong>
          </template>
          <template #account>
            <strong class="text-highlighted">{{ invitation.account.name }}</strong>
            <span class="text-muted"> #{{ invitation.account.handle }}</span>
          </template>
          <template #role>{{ t(`economy.roles.${invitation.role}`).toLowerCase() }}</template>
        </i18n-t>
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="md"
          color="neutral"
          variant="soft"
          :label="t('economy.invitations.accept')"
          @click="emit('accept', invitation.id)"
        />
        <UButton
          size="md"
          color="neutral"
          variant="ghost"
          :label="t('economy.invitations.decline')"
          @click="emit('decline', invitation.id)"
        />
      </div>
    </div>
  </section>
</template>
