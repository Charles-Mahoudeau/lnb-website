<script setup lang="ts">
import { LINK_ACCESS, shortLinkBody } from '#shared/schemas/short-links';
import type { ShortLinkListItem } from '#shared/schemas/short-links';
import { SCHOOLS } from '#shared/utils/schools';
import { randomShortId } from '#shared/utils/short-links';

// Creates a short link, or edits one, in a side drawer. Closes with true once saved, or false.
// The short ID can't change after creation: printed links keep working.
const props = defineProps<{ link?: ShortLinkListItem }>();
const emit = defineEmits<{ close: [saved: boolean] }>();

const { t } = useI18n();
const toast = useToast();
const { isEnabled } = useFlags();

const state = reactive({
  shortId: props.link?.shortId ?? '',
  name: props.link?.name ?? '',
  destinationUrl: props.link?.destinationUrl ?? '',
  access: props.link?.access ?? 'any',
  tenantIds: [...(props.link?.tenantIds ?? [])],
  recordClicks: props.link?.recordClicks ?? false,
  enabled: props.link?.enabled ?? true,
});
const pending = ref(false);

const needsSignIn = computed(() => state.access !== 'any');
const trackingAvailable = computed(() => needsSignIn.value && isEnabled('shortLinks.tracking'));
const schoolsMissing = computed(() => state.access === 'schools' && !state.tenantIds.length);
const summary = computed(() => {
  if (state.access === 'any') return t('admin.shortLinks.form.summary.any');
  if (state.access === 'signed') return t('admin.shortLinks.form.summary.signed');
  return state.tenantIds.length
    ? t('admin.shortLinks.form.summary.schools', {
        schools: new Intl.ListFormat(undefined, { type: 'conjunction' }).format(
          state.tenantIds.map((tid) => SCHOOLS[tid] ?? tid),
        ),
      })
    : t('admin.shortLinks.form.summary.noSchool');
});

function toggleSchool(tid: string) {
  const index = state.tenantIds.indexOf(tid);
  if (index > -1) state.tenantIds.splice(index, 1);
  else state.tenantIds.push(tid);
}

function fail(error: unknown) {
  const problem = error instanceof ShortLinkError ? error.problem : 'failed';
  toast.add({
    title: t(`admin.shortLinks.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

async function onSubmit() {
  if (schoolsMissing.value) return;
  pending.value = true;
  try {
    const body = { ...state, recordClicks: needsSignIn.value && state.recordClicks };
    if (props.link) {
      const { shortId: _shortId, ...patch } = body;
      await shortLinkActions.update(props.link.id, patch);
    } else {
      await shortLinkActions.create(body);
    }
    toast.add({
      title: t(props.link ? 'admin.shortLinks.form.saved' : 'admin.shortLinks.form.created'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    fail(error);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <USlideover
    :title="
      props.link
        ? t('admin.shortLinks.form.editTitle', { id: props.link.shortId })
        : t('admin.shortLinks.form.addTitle')
    "
    :close="{ onClick: () => emit('close', false) }"
    @update:open="(open: boolean) => !open && emit('close', false)"
  >
    <template #body>
      <UForm
        id="short-link-form"
        :schema="shortLinkBody"
        :state="state"
        class="flex flex-col gap-6"
        @submit="onSubmit"
      >
        <UFormField
          :label="t('admin.shortLinks.form.destination')"
          name="destinationUrl"
          :help="t('admin.shortLinks.form.destinationHelp')"
          required
        >
          <UInput
            v-model="state.destinationUrl"
            type="url"
            inputmode="url"
            placeholder="https://"
            :maxlength="2000"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.shortLinks.form.shortId')"
          name="shortId"
          :help="t('admin.shortLinks.form.shortIdHelp')"
        >
          <div class="flex gap-2">
            <UInput
              v-model="state.shortId"
              :disabled="!!props.link"
              :maxlength="40"
              placeholder="lan-party"
              class="min-w-0 flex-1"
            >
              <template #leading>
                <span class="text-sm text-muted">/go/</span>
              </template>
            </UInput>
            <UButton
              v-if="!props.link"
              color="neutral"
              variant="outline"
              :label="t('admin.shortLinks.form.generate')"
              @click="state.shortId = randomShortId()"
            />
          </div>
        </UFormField>

        <UFormField
          :label="t('admin.shortLinks.form.name')"
          name="name"
          :help="t('admin.shortLinks.form.nameHelp')"
          required
        >
          <UInput v-model="state.name" :maxlength="80" class="w-full" />
        </UFormField>

        <UFormField :label="t('admin.shortLinks.form.access')" name="access">
          <URadioGroup
            v-model="state.access"
            variant="card"
            color="secondary"
            :items="
              LINK_ACCESS.map((value) => ({
                value,
                label: t(`admin.shortLinks.form.accessOptions.${value}.label`),
                description: t(`admin.shortLinks.form.accessOptions.${value}.description`),
              }))
            "
            value-key="value"
          />
        </UFormField>

        <UFormField
          v-if="state.access === 'schools'"
          :label="t('admin.shortLinks.form.schools')"
          name="tenantIds"
          :error="schoolsMissing ? t('admin.shortLinks.form.noSchool') : undefined"
        >
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="(name, tid) in SCHOOLS"
              :key="tid"
              size="md"
              :color="state.tenantIds.includes(tid) ? 'secondary' : 'neutral'"
              :variant="state.tenantIds.includes(tid) ? 'subtle' : 'outline'"
              :aria-pressed="state.tenantIds.includes(tid)"
              :label="name"
              @click="toggleSchool(tid)"
            />
          </div>
        </UFormField>

        <UFormField name="recordClicks">
          <USwitch
            v-model="state.recordClicks"
            :disabled="!trackingAvailable"
            :label="t('admin.shortLinks.form.record')"
            :description="
              !needsSignIn
                ? t('admin.shortLinks.form.recordNeedsSignIn')
                : !isEnabled('shortLinks.tracking')
                  ? t('admin.shortLinks.form.recordFlagOff')
                  : t('admin.shortLinks.form.recordHelp')
            "
          />
        </UFormField>

        <UFormField name="enabled">
          <USwitch
            v-model="state.enabled"
            :label="t('admin.shortLinks.form.enabled')"
            :description="t('admin.shortLinks.form.enabledHelp')"
          />
        </UFormField>

        <UAlert
          color="neutral"
          variant="soft"
          :icon="state.access === 'any' ? 'i-lucide-globe' : 'i-lucide-lock'"
          :description="summary"
        />
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="outline"
          :label="t('admin.cancel')"
          @click="emit('close', false)"
        />
        <UButton
          type="submit"
          form="short-link-form"
          :loading="pending"
          :disabled="schoolsMissing"
          :label="t(props.link ? 'admin.shortLinks.form.save' : 'admin.shortLinks.form.create')"
        />
      </div>
    </template>
  </USlideover>
</template>
