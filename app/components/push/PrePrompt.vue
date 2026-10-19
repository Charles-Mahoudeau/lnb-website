<script setup lang="ts">
// Our own question, before the browser's: a bottom sheet offered right after a registration.
// Only "Notify me" triggers the browser's prompt, since that one can't be asked twice. "Not now",
// or dismissing the sheet, keeps it quiet on this device for as long as the admin chose.
const open = defineModel<boolean>('open', { default: false });

const { t } = useI18n();
const toast = useToast();
const push = usePush();

const GETS = ['0', '1', '2'] as const;
let answered = false;

async function yes() {
  answered = true;
  open.value = false;
  try {
    await push.enable();
    toast.add({ title: t('push.prompt.enabled'), color: 'success', icon: 'i-lucide-circle-check' });
  } catch (error) {
    const denied = (error as Error).message === 'denied';
    toast.add({
      title: t(denied ? 'push.prompt.denied' : 'push.prompt.failed'),
      color: denied ? 'neutral' : 'error',
      icon: denied ? 'i-lucide-bell-off' : 'i-lucide-circle-alert',
    });
  }
}

function later() {
  answered = true;
  open.value = false;
  push.snooze();
  const days = push.status.value?.silenceDays ?? null;
  toast.add({
    title: days === null ? t('push.prompt.snoozedNever') : t('push.prompt.snoozedDays', { days }),
    color: 'neutral',
    icon: 'i-lucide-info',
  });
}

// Swiping the sheet away or pressing Escape counts as "Not now", without the toast.
watch(open, (isOpen) => {
  if (isOpen) {
    answered = false;
  } else if (!answered) {
    push.snooze();
  }
});
</script>

<template>
  <UDrawer
    v-model:open="open"
    direction="bottom"
    :ui="{ content: 'mx-auto max-w-lg' }"
    :title="t('push.prompt.title')"
    :description="t('push.prompt.intro')"
  >
    <template #body>
      <ul class="flex flex-col gap-3">
        <li v-for="get in GETS" :key="get" class="flex items-start gap-3">
          <IconTile icon="i-lucide-bell" class="size-8" />
          <span class="pt-1">{{ t(`push.prompt.gets.${get}`) }}</span>
        </li>
      </ul>
    </template>
    <template #footer>
      <div class="flex flex-col gap-2">
        <UButton block :label="t('push.prompt.yes')" :loading="push.pending.value" @click="yes" />
        <UButton
          block
          color="neutral"
          variant="ghost"
          :label="t('push.prompt.later')"
          @click="later"
        />
      </div>
    </template>
  </UDrawer>
</template>
