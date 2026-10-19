<script setup lang="ts">
import type { PushImpactView } from '#shared/schemas/push';

// The question before an action that sends notifications: how many people, how many already got
// the weekly limit, and what they will see. The limit only warns. Opened with useOverlay(); closes
// with true when confirmed. `impact` is null when the count failed: continuing is still possible.
withDefaults(
  defineProps<{
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    impact: PushImpactView | null;
    /** Destructive actions use the error outline, never a solid red (docs/design.md). */
    destructive?: boolean;
  }>(),
  { destructive: false },
);

const emit = defineEmits<{ close: [confirmed: boolean] }>();

const { t, locale } = useI18n();

/** Held back, as announcements are at night: more than a minute from now. */
function held(sendAt: string) {
  return Date.parse(sendAt) - Date.now() > 60_000;
}
</script>

<template>
  <UModal :title="title" :description="description" :close="false">
    <template #body>
      <div class="flex flex-col gap-4">
        <template v-if="impact">
          <div class="flex flex-col gap-1">
            <p class="font-medium text-highlighted">
              {{
                t('admin.events.push.recipients', { count: impact.recipients }, impact.recipients)
              }}
            </p>
            <p v-if="impact.audience > impact.recipients" class="text-sm text-muted">
              {{ t('admin.events.push.concerned', { audience: impact.audience }) }}
            </p>
          </div>
          <UAlert
            v-if="impact.recipients > 0 && held(impact.sendAt)"
            color="neutral"
            variant="subtle"
            icon="i-lucide-moon"
            :description="t('admin.events.push.heldUntil', parisParts(impact.sendAt, locale))"
          />
          <UAlert
            v-if="impact.recipients > 0"
            :color="impact.overCap > 0 ? 'warning' : 'neutral'"
            variant="subtle"
            :icon="impact.overCap > 0 ? 'i-lucide-triangle-alert' : 'i-lucide-circle-check'"
            :description="
              impact.overCap > 0
                ? t('admin.events.push.overCap', { count: impact.overCap, cap: impact.weeklyCap })
                : t('admin.events.push.underCap', { cap: impact.weeklyCap })
            "
          />
          <div v-if="impact.recipients > 0" class="flex flex-col gap-2">
            <p class="text-sm text-muted">{{ t('admin.events.push.preview') }}</p>
            <div class="flex gap-3 rounded-lg bg-accented p-3">
              <img src="/logo.svg" alt="" class="size-9 shrink-0 rounded-md dark:hidden" />
              <img
                src="/logo-dark.svg"
                alt=""
                class="hidden size-9 shrink-0 rounded-md dark:block"
              />
              <div class="min-w-0">
                <p class="font-semibold text-highlighted">{{ impact.preview.title }}</p>
                <p class="text-sm text-muted">{{ impact.preview.body }}</p>
              </div>
            </div>
          </div>
        </template>
        <UAlert
          v-else
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          :description="t('admin.events.push.unknown')"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="cancelLabel"
          @click="emit('close', false)"
        />
        <UButton
          :color="destructive ? 'error' : 'primary'"
          :variant="destructive ? 'outline' : 'solid'"
          :label="confirmLabel"
          @click="emit('close', true)"
        />
      </div>
    </template>
  </UModal>
</template>
