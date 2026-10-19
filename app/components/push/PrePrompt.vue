<script setup lang="ts">
import { UDrawer, UModal } from '#components';

// Our own question, before the browser's: a bottom sheet on phones and a centered dialog on
// desktop, offered right after a registration. Only "Notify me" triggers the browser's prompt,
// since that one can't be asked twice. "Not now", or dismissing it, keeps it quiet on this device
// for as long as the admin chose.
const open = defineModel<boolean>('open', { default: false });

const { t } = useI18n();
const toast = useToast();
const push = usePush();

const GETS = ['0', '1', '2'] as const;
let answered = false;

// `sm` and up, like Tailwind's breakpoint. The server and a phone render the sheet.
const desktop = ref(false);
onMounted(() => {
  const query = window.matchMedia('(min-width: 40rem)');
  desktop.value = query.matches;
  query.addEventListener('change', (event) => (desktop.value = event.matches));
});

const container = computed(() => (desktop.value ? UModal : UDrawer));
const containerProps = computed(() =>
  desktop.value
    ? { close: false }
    : { direction: 'bottom' as const, ui: { content: 'mx-auto max-w-lg' } },
);

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

// Swiping the sheet away, clicking outside or pressing Escape counts as "Not now", without the toast.
watch(open, (isOpen) => {
  if (isOpen) {
    answered = false;
  } else if (!answered) {
    push.snooze();
  }
});
</script>

<template>
  <component
    :is="container"
    v-model:open="open"
    v-bind="containerProps"
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
      <div class="flex w-full flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-3">
        <UButton
          :block="!desktop"
          :label="t('push.prompt.yes')"
          :loading="push.pending.value"
          @click="yes"
        />
        <UButton
          :block="!desktop"
          color="neutral"
          variant="ghost"
          :label="t('push.prompt.later')"
          @click="later"
        />
      </div>
    </template>
  </component>
</template>
