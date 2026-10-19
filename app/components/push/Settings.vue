<script setup lang="ts">
import type { PushPreferences } from '#shared/schemas/push';

// The notification settings on /account: this device's switch, the four kinds, the devices and
// the count. See docs/design.md (Notifications) and docs/push.md.
const { t, locale } = useI18n();
const toast = useToast();
const push = usePush();
const { status, permission, enabledHere, pending, endpoint } = push;

// The server renders the card from the account's own data; the browser's permission and
// subscription are read once it's mounted.
await push.refresh();
const mounted = ref(false);
onMounted(async () => {
  mounted.value = true;
  await push.refresh();
});
watch(locale, () => push.syncLocale());

const KINDS = [
  'newEvents',
  'reminders',
  'spots',
  'changes',
] as const satisfies readonly (keyof PushPreferences)[];

const blocked = computed(() => permission.value === 'denied');
const unsupported = computed(() => permission.value === 'unsupported');
const needsHomeScreen = computed(() => mounted.value && push.needsHomeScreen());
// The master switch can't be used here: a note says why instead.
const locked = computed(
  () => !push.canSubscribe.value || blocked.value || unsupported.value || needsHomeScreen.value,
);
const switchedOff = computed(() => !!status.value && !status.value.configured);

function fail() {
  toast.add({ title: t('push.settings.failed'), color: 'error', icon: 'i-lucide-circle-alert' });
}

async function toggleHere(on: boolean) {
  try {
    if (on) await push.enable();
    else await push.disable();
  } catch (error) {
    if ((error as Error).message === 'denied') return;
    fail();
  }
}

async function toggleKind(key: keyof PushPreferences, value: boolean) {
  try {
    await push.setPreference(key, value);
  } catch {
    fail();
  }
}

async function removeDevice(id: number) {
  try {
    await push.removeDevice(id);
    toast.add({
      title: t('push.settings.removed'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch {
    fail();
  }
}

function since(iso: string) {
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso));
}
</script>

<template>
  <section
    v-if="status"
    class="flex w-full flex-col gap-6 rounded-lg bg-elevated p-6"
    aria-labelledby="push-settings-title"
  >
    <div class="flex flex-col gap-1">
      <h2 id="push-settings-title" class="text-2xl font-bold text-highlighted">
        {{ t('push.settings.title') }}
      </h2>
      <p class="text-muted">{{ t('push.settings.intro') }}</p>
    </div>

    <UAlert
      v-if="switchedOff"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :description="t('push.settings.disabled')"
    />
    <UAlert
      v-else-if="blocked"
      color="error"
      variant="outline"
      icon="i-lucide-bell-off"
      :description="t('push.settings.blocked')"
    />
    <UAlert
      v-else-if="needsHomeScreen"
      color="neutral"
      variant="subtle"
      icon="i-lucide-smartphone"
      :description="t('push.settings.ios')"
    />
    <UAlert
      v-else-if="unsupported"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :description="t('push.settings.unsupported')"
    />

    <div class="flex items-center gap-4">
      <IconTile :icon="enabledHere ? 'i-lucide-bell' : 'i-lucide-bell-off'" />
      <div class="min-w-0 flex-1">
        <p class="font-semibold text-highlighted">{{ t('push.settings.master') }}</p>
        <p class="text-sm text-muted">
          {{ enabledHere ? t('push.settings.on') : t('push.settings.off') }}
        </p>
      </div>
      <USwitch
        :model-value="enabledHere"
        :disabled="locked || pending"
        :loading="pending"
        :aria-label="t('push.settings.master')"
        @update:model-value="toggleHere"
      />
    </div>

    <template v-if="enabledHere || status.devices.length">
      <ul class="flex flex-col divide-y divide-default">
        <li v-for="kind in KINDS" :key="kind" class="flex items-center gap-4 py-3 first:pt-0">
          <div class="min-w-0 flex-1">
            <p class="font-medium text-highlighted">{{ t(`push.settings.kinds.${kind}.label`) }}</p>
            <p class="text-sm text-muted">{{ t(`push.settings.kinds.${kind}.description`) }}</p>
          </div>
          <USwitch
            :model-value="status.preferences[kind]"
            :aria-label="t(`push.settings.kinds.${kind}.label`)"
            @update:model-value="(value) => toggleKind(kind, value)"
          />
        </li>
      </ul>

      <div class="flex flex-col gap-3">
        <h3 class="font-semibold text-highlighted">{{ t('push.settings.devices') }}</h3>
        <ul class="flex flex-col gap-2">
          <li v-for="device in status.devices" :key="device.id" class="flex items-center gap-3">
            <UIcon name="i-lucide-smartphone" class="size-5 shrink-0 text-muted" />
            <div class="min-w-0 flex-1">
              <p class="truncate">
                <span class="font-medium text-highlighted">{{ device.device }}</span>
                <UBadge
                  v-if="device.endpoint === endpoint"
                  class="ml-2"
                  color="neutral"
                  variant="soft"
                  :label="t('push.settings.thisDevice')"
                />
              </p>
              <p class="text-sm text-muted tabular-nums">
                {{ t('push.settings.since', { date: since(device.createdAt) }) }}
              </p>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              size="md"
              :label="t('push.settings.remove')"
              @click="removeDevice(device.id)"
            />
          </li>
        </ul>
      </div>

      <p class="flex items-baseline gap-3">
        <span class="font-display text-2xl text-highlighted tabular-nums">
          {{ status.receivedLast7Days }}
        </span>
        <span class="text-muted">
          {{ t('push.settings.received') }}
        </span>
      </p>
    </template>

    <p class="flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-eye" class="size-4 shrink-0" />
      {{ t('push.settings.adminSees') }}
    </p>
  </section>
</template>
