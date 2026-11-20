<script setup lang="ts">
import { pushSettings as pushSettingsSchema } from '#shared/schemas/push';
import type { PushSettings } from '#shared/schemas/push';

// The notification settings, in Settings, Notifications: the weekly limit, how long to wait before
// silencing, and the quiet hours. Site admins only (the routes refuse everyone else).
const { t } = useI18n();
const toast = useToast();
const { user } = useAuth();
const admin = computed(() => isAdmin(user.value?.role));

const { data: settings, refresh: refreshSettings } = await useFetch<PushSettings>(
  '/api/admin/push/settings',
  { key: 'push-settings', immediate: admin.value },
);

const SILENCE = computed(() => [
  { label: t('admin.push.silence7'), value: '7' },
  { label: t('admin.push.silence30'), value: '30' },
  { label: t('admin.push.silenceNever'), value: 'never' },
]);

const form = reactive({
  weeklyCap: 3,
  silence: '30',
  quietEnabled: true,
  quietFrom: 22,
  quietUntil: 8,
});
const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  label: `${String(hour).padStart(2, '0')}:00`,
  value: hour,
}));
const quietEmpty = computed(() => form.quietEnabled && form.quietFrom === form.quietUntil);
watchEffect(() => {
  if (!settings.value) return;
  form.weeklyCap = settings.value.weeklyCap;
  form.silence = settings.value.silenceDays === null ? 'never' : String(settings.value.silenceDays);
  form.quietEnabled = settings.value.quietEnabled;
  form.quietFrom = settings.value.quietFrom;
  form.quietUntil = settings.value.quietUntil;
});

const saving = ref(false);
async function onSave() {
  const parsed = pushSettingsSchema.safeParse({
    weeklyCap: form.weeklyCap,
    silenceDays: form.silence === 'never' ? null : Number(form.silence),
    quietEnabled: form.quietEnabled,
    quietFrom: form.quietFrom,
    quietUntil: form.quietUntil,
  });
  if (!parsed.success) return;
  saving.value = true;
  try {
    await $fetch('/api/admin/push/settings', { method: 'PATCH', body: parsed.data });
    await Promise.all([refreshSettings(), refreshNuxtData('push-overview')]);
    toast.add({ title: t('admin.push.saved'), color: 'success', icon: 'i-lucide-circle-check' });
  } catch {
    toast.add({
      title: t('admin.flags.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section v-if="admin" class="flex max-w-lg flex-col gap-5 rounded-lg bg-elevated p-5">
    <h2 class="text-lg font-bold text-highlighted">{{ t('admin.push.settings') }}</h2>
    <UFormField :label="t('admin.push.cap')" :help="t('admin.push.capHelp')" name="weeklyCap">
      <UInputNumber v-model="form.weeklyCap" :min="1" :max="50" class="w-32" />
    </UFormField>
    <UFormField :label="t('admin.push.silence')" name="silence">
      <URadioGroup v-model="form.silence" :items="SILENCE" orientation="horizontal" />
    </UFormField>
    <div class="flex flex-col gap-3">
      <USwitch
        v-model="form.quietEnabled"
        :label="t('admin.push.quiet')"
        :description="t('admin.push.quietHelp')"
      />
      <UFormField
        v-if="form.quietEnabled"
        :error="quietEmpty ? t('admin.push.quietEmpty') : undefined"
        name="quietUntil"
      >
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-sm text-muted">{{ t('admin.push.quietFrom') }}</span>
          <USelect v-model="form.quietFrom" :items="HOURS" class="w-28" />
          <span class="text-sm text-muted">{{ t('admin.push.quietUntil') }}</span>
          <USelect v-model="form.quietUntil" :items="HOURS" class="w-28" />
        </div>
      </UFormField>
    </div>
    <div>
      <UButton
        :loading="saving"
        :disabled="quietEmpty"
        :label="t('admin.push.save')"
        @click="onSave"
      />
    </div>
  </section>
  <UAlert
    v-else
    color="neutral"
    variant="subtle"
    icon="i-lucide-info"
    :description="t('admin.push.settingsAdminsOnly')"
  />
</template>
