<script setup lang="ts">
import type { EconomyInviteOption, EconomyRole } from '#shared/schemas/economy';

// The owner's search for players to invite, as the tournaments' captains do: part of a name, an
// email or a Minecraft username. Results show the Minecraft head and username, the school and the
// email, to tell two people with the same name apart.
const props = defineProps<{ accountId: string; full: boolean }>();
const emit = defineEmits<{ invited: []; failed: [caught: unknown] }>();

const { t } = useI18n();
const toast = useToast();

const role = ref<EconomyRole>('member');
const roleItems = computed(() =>
  (['owner', 'member', 'viewer'] as const).map((value) => ({
    label: t(`economy.roles.${value}`),
    value,
  })),
);

const query = ref('');
const results = ref<EconomyInviteOption[]>([]);
const searched = ref(false);
const pending = ref<string | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;
watch(query, (q) => {
  clearTimeout(timer);
  searched.value = false;
  if (q.trim().length < 3) {
    results.value = [];
    return;
  }
  timer = setTimeout(() => {
    economyActions
      .inviteSearch(props.accountId, q.trim())
      .then((found) => {
        results.value = found.items;
        searched.value = true;
      })
      .catch(() => {
        results.value = [];
      });
  }, 300);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
});

async function onInvite(player: EconomyInviteOption) {
  pending.value = player.userId;
  try {
    await economyActions.invite(props.accountId, { userId: player.userId, role: role.value });
    player.invited = true;
    toast.add({
      title: t('economy.members.invited', { username: player.name }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('invited');
  } catch (caught) {
    emit('failed', caught);
  } finally {
    pending.value = null;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-4">
      <UFormField :label="t('economy.members.search')" class="min-w-48 flex-1">
        <UInput
          v-model="query"
          icon="i-lucide-search"
          :placeholder="t('economy.members.searchPlaceholder')"
          class="w-full"
          autocomplete="off"
        />
      </UFormField>
      <UFormField :label="t('economy.members.role')" class="w-44">
        <USelect v-model="role" :items="roleItems" class="w-full" />
      </UFormField>
    </div>
    <ul class="flex flex-col gap-1 text-sm">
      <li v-for="hint in ['owner', 'member', 'viewer'] as const" :key="hint">
        <strong class="text-highlighted">{{ t(`economy.roles.${hint}`) }}</strong>
        <span class="text-muted"> {{ t(`economy.roleHints.${hint}`) }}</span>
      </li>
    </ul>
    <ul v-if="results.length" class="flex flex-col gap-3">
      <li v-for="player in results" :key="player.userId" class="flex items-center gap-3">
        <WardenMinecraftHead :uuid="player.uuid" />
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium text-highlighted">
            {{ player.name }}
            <span class="font-normal text-muted">{{ player.username }}</span>
          </p>
          <p class="truncate text-sm text-muted">
            {{ [player.school, player.email].filter(Boolean).join(', ') }}
          </p>
        </div>
        <UBadge
          v-if="player.member"
          color="neutral"
          variant="soft"
          :label="t('economy.members.alreadyMember')"
        />
        <UBadge
          v-else-if="player.invited"
          color="neutral"
          variant="soft"
          :label="t('economy.members.alreadyInvited')"
        />
        <UButton
          v-else
          size="sm"
          :disabled="full"
          :loading="pending === player.userId"
          :label="t('economy.members.inviteAction')"
          @click="onInvite(player)"
        />
      </li>
    </ul>
    <p v-else-if="searched" class="text-muted">{{ t('economy.members.searchNone') }}</p>
    <p v-if="full" class="text-sm text-muted">{{ t('economy.members.full') }}</p>
  </div>
</template>
