<script setup lang="ts">
// The appeals tab: pending appeals, each answered with a response, accepted or rejected.
const emit = defineEmits<{ changed: [] }>();

const { t, locale } = useI18n();
const toast = useToast();
const labels = useWardenLabels();
const { appeals, decide } = useWardenAppeals();
const { data, refresh } = await appeals;

const responses = reactive<Record<string, string>>({});
const pending = ref<string | null>(null);

async function onDecide(id: string, accept: boolean) {
  const response = responses[id]?.trim();
  if (!response) {
    toast.add({
      title: t('wardenAdmin.appeals.needResponse'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    return;
  }
  pending.value = id;
  try {
    await decide(id, accept, response);
    toast.add({
      title: t(accept ? 'wardenAdmin.appeals.accepted' : 'wardenAdmin.appeals.rejected'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await refresh();
    emit('changed');
  } catch (error) {
    const problem = error instanceof WardenError ? error.problem : 'failed';
    toast.add({
      title: t(`wardenAdmin.errors.${problem === 'appealClosed' ? problem : 'failed'}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = null;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="!data?.length" class="rounded-lg bg-elevated px-5 py-10 text-center text-muted">
      {{ t('wardenAdmin.appeals.empty') }}
    </p>
    <article
      v-for="item in data"
      :key="item.appeal.id"
      class="flex flex-col gap-4 rounded-lg bg-elevated p-5"
    >
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-3">
          <NuxtLink
            :to="`/admin/warden/players/${item.player.userId}`"
            class="font-display text-xl font-medium text-highlighted hover:underline"
          >
            {{ item.player.name }}
          </NuxtLink>
          <UBadge color="error" variant="subtle" :label="t('wardenAdmin.players.banned')" />
        </div>
        <span class="text-sm text-muted">
          {{
            t('wardenAdmin.appeals.bannedBy', {
              date: formatWardenDate(item.ban.createdAt, locale),
              actor: labels.actor(item.ban.issuedBy),
            })
          }}
        </span>
      </div>
      <p class="text-sm text-muted">{{ item.ban.reason }}</p>
      <p class="border-l-2 border-default pl-3 whitespace-pre-line text-highlighted">
        {{ item.appeal.body }}
      </p>
      <UFormField :label="t('wardenAdmin.appeals.response')">
        <UTextarea
          v-model="responses[item.appeal.id]"
          :placeholder="t('wardenAdmin.appeals.responsePlaceholder')"
          :rows="2"
          autoresize
          :maxlength="2000"
          class="w-full"
        />
      </UFormField>
      <div class="flex flex-wrap gap-3">
        <UButton
          :label="t('wardenAdmin.appeals.accept')"
          :loading="pending === item.appeal.id"
          @click="onDecide(item.appeal.id, true)"
        />
        <UButton
          color="neutral"
          variant="outline"
          :label="t('wardenAdmin.appeals.reject')"
          :disabled="pending === item.appeal.id"
          @click="onDecide(item.appeal.id, false)"
        />
      </div>
    </article>
  </div>
</template>
