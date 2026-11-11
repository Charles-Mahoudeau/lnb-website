<script setup lang="ts">
import type { PartnerAdminView } from '#shared/schemas/partner-events';
import type { PushImpactView } from '#shared/schemas/push';

// The event itself: dates, links, the two switches, the hero image, the spreadsheet for the
// organizer, and closing. See docs/partner-events.md.
const props = defineProps<{ event: PartnerAdminView }>();
const emit = defineEmits<{ changed: [] }>();

const { t, d, locale } = useI18n();
const toast = useToast();

const form = reactive({
  dateTextEn: props.event.dateTextEn,
  dateTextFr: props.event.dateTextFr,
  websiteUrl: props.event.websiteUrl ?? '',
  discordUrl: props.event.discordUrl ?? '',
  dateConfirmed: props.event.dateConfirmed,
  interestOpen: props.event.interestOpen,
  teamsOpen: props.event.teamsOpen,
});
const heroKey = ref(props.event.heroKey);
const heroUrl = ref(props.event.hero);
const pending = ref(false);
const closing = ref(false);
const announcing = ref(false);
const impact = ref<PushImpactView | null>(null);

async function askAnnounce() {
  impact.value = null;
  announcing.value = true;
  try {
    impact.value = await partnerEventAdminActions.announceImpact(
      props.event.slug,
      locale.value === 'fr' ? 'fr' : 'en',
    );
  } catch {
    announcing.value = false;
    toast.add({
      title: t('admin.partnerEvents.notify.impactFailed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}

async function onAnnounce() {
  const done = await run(async () => {
    const sent = await partnerEventAdminActions.announce(props.event.slug);
    toast.add({
      title: t('admin.partnerEvents.notify.sent', { count: sent.recipients }, sent.recipients),
      description: t('admin.partnerEvents.notify.when', {
        date: d(sent.sendAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }),
      }),
      color: 'success',
      icon: 'i-lucide-bell-ring',
    });
  }, '');
  if (done) announcing.value = false;
}

async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
  pending.value = true;
  try {
    await action();
    emit('changed');
    if (success) toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
    return true;
  } catch (cause) {
    const problem = cause instanceof PartnerEventError ? cause.problem : 'failed';
    toast.add({
      title: t(`partnerEvents.problems.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    return false;
  } finally {
    pending.value = false;
  }
}

const save = () =>
  run(
    () =>
      partnerEventAdminActions.settings(props.event.slug, {
        dateTextEn: form.dateTextEn,
        dateTextFr: form.dateTextFr,
        websiteUrl: form.websiteUrl.trim() || null,
        discordUrl: form.discordUrl.trim() || null,
        dateConfirmed: form.dateConfirmed,
        interestOpen: form.interestOpen,
        teamsOpen: form.teamsOpen,
        heroKey: heroKey.value,
      }),
    t('admin.partnerEvents.saved'),
  );

const picker = ref<HTMLInputElement | null>(null);
async function onChosen(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  await run(async () => {
    const stored = await partnerEventAdminActions.upload(props.event.slug, file);
    heroKey.value = stored.key;
    heroUrl.value = stored.url;
  }, t('admin.partnerEvents.event.uploaded'));
}

async function onClose() {
  if (
    await run(
      () => partnerEventAdminActions.close(props.event.slug),
      t('admin.partnerEvents.event.closedToast'),
    )
  ) {
    closing.value = false;
  }
}
const onReopen = () =>
  run(
    () => partnerEventAdminActions.reopen(props.event.slug),
    t('admin.partnerEvents.event.reopenedToast'),
  );

const purgeDate = computed(() =>
  d(new Date(Date.now() + 60 * 86_400_000), { dateStyle: 'long', timeZone: 'Europe/Paris' }),
);
</script>

<template>
  <div class="flex flex-col gap-6">
    <UCard>
      <template #header>
        <h2 class="text-lg">{{ t('admin.partnerEvents.event.title') }}</h2>
      </template>
      <form class="flex flex-col gap-5" @submit.prevent="save">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            :label="t('admin.partnerEvents.event.dateEn')"
            :help="t('admin.partnerEvents.event.dateHint')"
          >
            <UInput v-model="form.dateTextEn" class="w-full" :maxlength="80" />
          </UFormField>
          <UFormField :label="t('admin.partnerEvents.event.dateFr')">
            <UInput v-model="form.dateTextFr" class="w-full" :maxlength="80" />
          </UFormField>
          <UFormField :label="t('admin.partnerEvents.event.website')">
            <UInput v-model="form.websiteUrl" type="url" class="w-full" placeholder="https://" />
          </UFormField>
          <UFormField :label="t('admin.partnerEvents.event.discord')">
            <UInput v-model="form.discordUrl" type="url" class="w-full" placeholder="https://" />
          </UFormField>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <USwitch
            v-model="form.dateConfirmed"
            :label="t('admin.partnerEvents.event.dateConfirmed')"
            :description="t('admin.partnerEvents.event.dateConfirmedHint')"
          />
          <USwitch
            v-model="form.interestOpen"
            :label="t('admin.partnerEvents.event.interestOpen')"
            :description="t('admin.partnerEvents.event.interestOpenHint')"
          />
          <USwitch
            v-model="form.teamsOpen"
            :label="t('admin.partnerEvents.event.teamsOpen')"
            :description="t('admin.partnerEvents.event.teamsOpenHint')"
          />
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <img v-if="heroUrl" :src="heroUrl" alt="" class="h-14 w-40 rounded-lg object-cover" />
          <div class="min-w-0 flex-1">
            <h3 class="font-sans text-sm font-semibold text-highlighted">
              {{ t('admin.partnerEvents.event.hero') }}
            </h3>
            <p class="text-sm text-muted">{{ t('admin.partnerEvents.event.heroHint') }}</p>
          </div>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-upload"
            :label="t('admin.partnerEvents.event.upload')"
            :disabled="pending"
            @click="picker?.click()"
          />
          <input ref="picker" type="file" accept="image/*" class="hidden" @change="onChosen" />
        </div>
        <div class="flex justify-end">
          <UButton type="submit" :label="t('admin.partnerEvents.save')" :loading="pending" />
        </div>
      </form>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-lg">{{ t('admin.partnerEvents.export.title') }}</h2>
      </template>
      <div class="flex flex-col items-start gap-4">
        <p class="text-muted">{{ t('admin.partnerEvents.export.text') }}</p>
        <UButton
          :to="`/api/admin/partner-events/${event.slug}/export`"
          external
          download
          icon="i-lucide-file-spreadsheet"
          :label="t('admin.partnerEvents.export.button')"
        />
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-lg">{{ t('admin.partnerEvents.notify.title') }}</h2>
      </template>
      <div class="flex flex-col items-start gap-4">
        <p class="text-muted">{{ t('admin.partnerEvents.notify.text') }}</p>
        <p v-if="event.announcedAt" class="text-sm text-muted">
          {{
            t('admin.partnerEvents.notify.announced', {
              date: d(event.announcedAt, { dateStyle: 'long', timeZone: 'Europe/Paris' }),
            })
          }}
        </p>
        <UButton
          icon="i-lucide-bell-ring"
          :label="t('admin.partnerEvents.notify.button')"
          :disabled="!!event.announcedAt || !!event.closedAt"
          @click="askAnnounce"
        />
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-lg">{{ t('admin.partnerEvents.event.endTitle') }}</h2>
      </template>
      <div class="flex flex-col items-start gap-4">
        <p class="text-muted">
          {{
            event.closedAt
              ? t('admin.partnerEvents.event.closedText', {
                  date: d(event.purgeAt!, { dateStyle: 'long', timeZone: 'Europe/Paris' }),
                })
              : t('admin.partnerEvents.event.openText')
          }}
        </p>
        <UButton
          v-if="event.closedAt"
          color="neutral"
          variant="outline"
          :label="t('admin.partnerEvents.event.reopen')"
          :loading="pending"
          @click="onReopen"
        />
        <UButton
          v-else
          color="error"
          variant="outline"
          :label="t('admin.partnerEvents.event.close')"
          @click="closing = true"
        />
      </div>
    </UCard>

    <UModal
      v-model:open="announcing"
      :title="t('admin.partnerEvents.notify.confirmTitle')"
      :description="t('admin.partnerEvents.notify.confirmText')"
    >
      <template #body>
        <p v-if="!impact" class="text-muted">{{ t('admin.partnerEvents.notify.loading') }}</p>
        <div v-else class="flex flex-col gap-4">
          <p>
            {{
              t('admin.partnerEvents.notify.recipients', {
                count: impact.recipients,
                audience: impact.audience,
              })
            }}
          </p>
          <p v-if="impact.overCap > 0" class="text-warning">
            {{
              t('admin.partnerEvents.notify.overCap', {
                count: impact.overCap,
                cap: impact.weeklyCap,
              })
            }}
          </p>
          <p class="text-sm text-muted">
            {{
              t('admin.partnerEvents.notify.sendAt', {
                date: d(impact.sendAt, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Europe/Paris',
                }),
              })
            }}
          </p>
          <div class="rounded-lg bg-elevated p-4">
            <p class="font-semibold text-highlighted">{{ impact.preview.title }}</p>
            <p class="text-sm text-muted">{{ impact.preview.body }}</p>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton
          color="neutral"
          variant="outline"
          :label="t('partnerEvents.teams.cancel')"
          @click="announcing = false"
        />
        <UButton
          :label="t('admin.partnerEvents.notify.send')"
          :loading="pending"
          :disabled="!impact || impact.recipients === 0"
          @click="onAnnounce"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="closing"
      :title="t('admin.partnerEvents.event.closeTitle')"
      :description="t('admin.partnerEvents.event.closeText', { date: purgeDate })"
    >
      <template #footer>
        <UButton
          color="neutral"
          variant="outline"
          :label="t('admin.partnerEvents.event.keepOpen')"
          @click="closing = false"
        />
        <UButton
          color="error"
          :label="t('admin.partnerEvents.event.close')"
          :loading="pending"
          @click="onClose"
        />
      </template>
    </UModal>
  </div>
</template>
