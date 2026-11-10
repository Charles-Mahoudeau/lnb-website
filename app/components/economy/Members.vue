<script setup lang="ts">
import { WardenConfirmModal } from '#components';

import type { EconomyAccountView, EconomyInviteBody, EconomyRole } from '#shared/schemas/economy';
import { economyInviteBody } from '#shared/schemas/economy';

// Who is in a shared account. Owners change roles, remove members and invite players.
const props = defineProps<{ account: EconomyAccountView }>();
const emit = defineEmits<{ changed: []; failed: [caught: unknown] }>();
const { t } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const { user } = useAuth();

const id = computed(() => props.account.id);
const { data, refresh } = await useEconomyAccount(id);
const owner = computed(() => props.account.role === 'owner');
const confirm = overlay.create(WardenConfirmModal);

const roleItems = computed(() =>
  (['owner', 'member', 'viewer'] as const).map((role) => ({
    label: t(`economy.roles.${role}`),
    value: role,
  })),
);

async function run(action: () => Promise<unknown>, success?: string) {
  try {
    await action();
    if (success) toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
    await refresh();
    emit('changed');
    return true;
  } catch (caught) {
    emit('failed', caught);
    return false;
  }
}

async function onRole(userId: string, role: EconomyRole) {
  await run(
    () => economyActions.setRole(props.account.id, userId, role),
    t('economy.members.roleSaved'),
  );
}

async function onRemove(userId: string, name: string) {
  const confirmed: unknown = await confirm.open({
    title: t('economy.members.removeTitle', { name }),
    description: t('economy.members.removeBody'),
    confirmLabel: t('economy.members.remove'),
    cancelLabel: t('economy.cancel'),
    destructive: true,
  }).result;
  if (confirmed === true) {
    await run(
      () => economyActions.removeMember(props.account.id, userId),
      t('economy.members.removed'),
    );
  }
}

const form = reactive<EconomyInviteBody>({ username: '', role: 'member' });
const inviting = ref(false);
async function onInvite() {
  inviting.value = true;
  const done = await run(
    () => economyActions.invite(props.account.id, { ...form }),
    t('economy.members.invited', { username: form.username }),
  );
  if (done) form.username = '';
  inviting.value = false;
}

const seats = computed(() =>
  data.value ? data.value.members.length + data.value.invitations.length : 0,
);
</script>

<template>
  <div v-if="data" class="flex flex-col gap-6">
    <section class="flex flex-col gap-3" aria-labelledby="economy-members">
      <h3 id="economy-members" class="text-lg font-medium text-highlighted">
        {{ t('economy.members.title', { n: data.members.length }, data.members.length) }}
        <span class="font-sans text-sm font-normal text-muted">
          {{ t('economy.members.of', { max: data.maxMembers }) }}
        </span>
      </h3>
      <ul class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
        <li
          v-for="member in data.members"
          :key="member.userId"
          class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
        >
          <WardenMinecraftHead v-if="member.uuid" :uuid="member.uuid" />
          <span class="flex min-w-40 flex-1 flex-col">
            <span class="font-semibold text-highlighted">
              {{ member.name ?? member.username }}
              <span v-if="member.userId === user?.id" class="font-normal text-muted">
                {{ t('economy.members.you') }}
              </span>
            </span>
            <span v-if="member.name" class="text-sm text-muted">{{ member.username }}</span>
          </span>
          <USelect
            v-if="owner"
            size="md"
            class="w-32"
            :items="roleItems"
            :model-value="member.role"
            :aria-label="t('economy.members.roleOf', { name: member.name ?? member.username })"
            @update:model-value="(role) => onRole(member.userId, role as EconomyRole)"
          />
          <UBadge
            v-else
            color="neutral"
            variant="soft"
            :label="t(`economy.roles.${member.role}`)"
          />
          <UButton
            v-if="owner && member.userId !== user?.id"
            size="md"
            color="neutral"
            variant="ghost"
            :label="t('economy.members.remove')"
            @click="onRemove(member.userId, member.name ?? member.username ?? '')"
          />
        </li>
      </ul>
    </section>

    <section
      v-if="owner && data.invitations.length"
      class="flex flex-col gap-3"
      aria-labelledby="economy-pending"
    >
      <h3 id="economy-pending" class="text-lg font-medium text-highlighted">
        {{ t('economy.members.pending') }}
      </h3>
      <ul class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
        <li
          v-for="invitation in data.invitations"
          :key="invitation.id"
          class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
        >
          <WardenMinecraftHead v-if="invitation.uuid" :uuid="invitation.uuid" />
          <span class="flex min-w-40 flex-1 flex-col">
            <span class="font-semibold text-highlighted">{{
              invitation.name ?? invitation.username
            }}</span>
            <span class="text-sm text-muted">
              {{
                t('economy.members.invitedAs', {
                  role: t(`economy.roles.${invitation.role}`).toLowerCase(),
                })
              }}
            </span>
          </span>
          <UButton
            size="md"
            color="neutral"
            variant="ghost"
            :label="t('economy.members.cancelInvitation')"
            @click="run(() => economyActions.cancelInvitation(account.id, invitation.id))"
          />
        </li>
      </ul>
    </section>

    <section
      v-if="owner"
      class="flex flex-col gap-4 rounded-lg bg-elevated p-6"
      aria-labelledby="economy-invite"
    >
      <div class="flex flex-col gap-1">
        <h3 id="economy-invite" class="text-lg font-medium text-highlighted">
          {{ t('economy.members.inviteTitle') }}
        </h3>
        <p class="text-sm text-muted">{{ t('economy.members.inviteLede') }}</p>
      </div>
      <UForm
        :schema="economyInviteBody"
        :state="form"
        class="flex flex-col gap-4"
        @submit="onInvite"
      >
        <div class="flex flex-wrap gap-4">
          <UFormField
            name="username"
            :label="t('economy.members.username')"
            class="min-w-48 flex-1"
          >
            <UInput v-model="form.username" class="w-full" autocomplete="off" />
          </UFormField>
          <UFormField name="role" :label="t('economy.members.role')" class="w-44">
            <USelect v-model="form.role" :items="roleItems" class="w-full" />
          </UFormField>
        </div>
        <ul class="flex flex-col gap-1 text-sm">
          <li v-for="role in ['owner', 'member', 'viewer'] as const" :key="role">
            <strong class="text-highlighted">{{ t(`economy.roles.${role}`) }}</strong>
            <span class="text-muted"> {{ t(`economy.roleHints.${role}`) }}</span>
          </li>
        </ul>
        <div class="flex flex-wrap items-center gap-3">
          <UButton
            type="submit"
            :loading="inviting"
            :disabled="seats >= data.maxMembers"
            :label="t('economy.members.invite')"
          />
          <span v-if="seats >= data.maxMembers" class="text-sm text-muted">
            {{ t('economy.members.full') }}
          </span>
        </div>
      </UForm>
    </section>
  </div>
</template>
