<script setup lang="ts">
import type { WardenDeviceView } from '#shared/schemas/warden';

// The devices of the LNB Warden mod signed in to the account, each with a Revoke button.
defineProps<{ devices: WardenDeviceView[] }>();
const emit = defineEmits<{ revoke: [device: WardenDeviceView] }>();

const { t, locale } = useI18n();
</script>

<template>
  <section class="flex flex-col gap-4" aria-labelledby="warden-devices">
    <h2 id="warden-devices" class="text-2xl font-medium text-highlighted">
      {{ t('warden.devices.title') }}
    </h2>
    <p class="max-w-xl text-muted">{{ t('warden.devices.help') }}</p>

    <div
      v-if="devices.length === 0"
      class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-5 py-10 text-center"
    >
      <span class="grid size-12 place-items-center rounded-full bg-accented text-muted">
        <UIcon name="i-lucide-monitor-smartphone" class="size-6" />
      </span>
      <h3 class="text-xl font-medium text-highlighted">{{ t('warden.devices.empty.title') }}</h3>
      <p class="max-w-md text-muted">{{ t('warden.devices.empty.body') }}</p>
    </div>

    <div v-else class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
      <div
        v-for="device in devices"
        :key="device.id"
        class="flex flex-wrap items-center gap-4 px-5 py-4"
      >
        <span class="grid size-10 place-items-center rounded-full bg-accented text-muted">
          <UIcon name="i-lucide-monitor" class="size-5" />
        </span>
        <div class="flex min-w-0 flex-1 basis-60 flex-col gap-1.5">
          <span class="font-semibold break-all text-highlighted">{{ device.name }}</span>
          <div class="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            <span>
              {{ t('warden.devices.linkedOn') }}
              <span class="text-default">{{ formatWardenDate(device.createdAt, locale) }}</span>
            </span>
            <span>
              {{ t('warden.devices.lastUsed') }}
              <span class="text-default">
                {{ formatWardenRelative(device.lastUsedAt, locale) }}
              </span>
            </span>
          </div>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          size="md"
          :label="t('warden.devices.revoke')"
          @click="emit('revoke', device)"
        />
      </div>
    </div>
  </section>
</template>
