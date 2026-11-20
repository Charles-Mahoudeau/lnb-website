<script setup lang="ts">
// A page of the Market section: the tabs, a line about what the Market is with whether it is on,
// then the tab. The item drawer lives here, so any tab can open one (`?item=`).
defineProps<{ tab: string }>();
const { t } = useI18n();
const { isEnabled } = useFlags();
const { user } = useAuth();

const on = computed(() => isEnabled('economy.market'));
</script>

<template>
  <AdminTabPage entry="market" :tab="tab">
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="max-w-2xl text-muted">{{ t('admin.market.lede') }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :color="on ? 'success' : 'warning'"
            variant="subtle"
            size="lg"
            :label="t(on ? 'admin.market.status.on' : 'admin.market.status.off')"
          />
          <UButton
            v-if="isAdmin(user?.role)"
            to="/admin/settings/flags"
            color="neutral"
            variant="outline"
            size="sm"
            :label="t('admin.market.status.flags')"
          />
          <span v-else class="text-sm text-muted">{{ t('admin.market.status.ask') }}</span>
        </div>
      </div>
      <slot />
    </div>
    <AdminMarketItemDrawer />
  </AdminTabPage>
</template>
