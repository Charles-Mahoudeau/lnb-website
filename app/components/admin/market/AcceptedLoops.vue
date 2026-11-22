<script setup lang="ts">
// The crafting loops admins let through on purpose (docs/market.md, "Accepted loops"), each with
// whether it is a loop in the catalog as it is now, and a Revoke button.
import { marketItemName } from '#shared/utils/market';

const { t, d } = useI18n();
const toast = useToast();
const { data, refresh } = await useMarketAcceptedLoops();

const revoking = ref<string | null>(null);
async function revoke(id: string) {
  revoking.value = id;
  try {
    await marketAdminActions.revokeLoop(id);
    await refresh();
    toast.add({
      title: t('admin.market.loops.revoked'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch {
    toast.add({
      title: t('admin.market.refusal.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    revoking.value = null;
  }
}

const route = (loop: NonNullable<typeof data.value>['items'][number]) =>
  loop.path
    .map((step) => step.inputs.map((input) => marketItemName(input.id)).join(' + '))
    .filter((name, index, all) => all.indexOf(name) === index)
    .join(' → ');
</script>

<template>
  <section class="flex flex-col gap-4 rounded-lg bg-elevated px-6 py-5">
    <div>
      <h2 class="text-lg font-medium text-highlighted">{{ t('admin.market.loops.listTitle') }}</h2>
      <p class="text-sm text-muted">{{ t('admin.market.loops.listLede') }}</p>
    </div>
    <p v-if="!data?.items.length" class="text-sm text-muted">{{ t('admin.market.loops.none') }}</p>
    <ul v-else class="divide-y divide-default">
      <li
        v-for="loop in data.items"
        :key="loop.id"
        class="flex flex-wrap items-center justify-between gap-3 py-3"
      >
        <div class="min-w-0">
          <p class="font-medium text-highlighted">
            {{ route(loop) }} → {{ marketItemName(loop.item) }}
            <UBadge
              class="ml-2"
              variant="subtle"
              :color="loop.active ? 'warning' : 'neutral'"
              :label="t(loop.active ? 'admin.market.loops.active' : 'admin.market.loops.dormant')"
            />
          </p>
          <p class="text-sm text-muted">{{ loop.reason }}</p>
          <p class="text-xs text-muted">
            {{
              t('admin.market.loops.by', {
                name: loop.acceptedBy ?? '—',
                date: d(loop.acceptedAt, { dateStyle: 'medium' }),
              })
            }}
          </p>
        </div>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          :loading="revoking === loop.id"
          :label="t('admin.market.loops.revoke')"
          @click="revoke(loop.id)"
        />
      </li>
    </ul>
  </section>
</template>
