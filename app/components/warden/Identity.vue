<script setup lang="ts">
// Whether other players see the player's name under their username, with a preview of the
// nametag. Hiding it asks first: the page handles that through `update`.
defineProps<{ showRealName: boolean; shortName: string; username: string; pending: boolean }>();
const emit = defineEmits<{ update: [showRealName: boolean] }>();

const { t } = useI18n();
</script>

<template>
  <section class="flex flex-col gap-4" aria-labelledby="warden-identity">
    <h2 id="warden-identity" class="text-2xl font-medium text-highlighted">
      {{ t('warden.identity.title') }}
    </h2>
    <div class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <USwitch
        :model-value="showRealName"
        :label="t('warden.identity.label')"
        :description="t('warden.identity.help')"
        :loading="pending"
        :ui="{
          root: 'flex-row-reverse justify-between gap-6',
          label: 'font-semibold text-highlighted',
        }"
        @update:model-value="(value) => emit('update', Boolean(value))"
      />
      <div class="flex flex-wrap items-center gap-4 rounded-md bg-default px-4 py-3">
        <span class="text-sm text-muted">{{ t('warden.identity.preview') }}</span>
        <WardenNametag :username="username" :name="showRealName ? shortName : null" />
      </div>
    </div>
  </section>
</template>
