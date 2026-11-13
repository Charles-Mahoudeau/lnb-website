<script setup lang="ts">
// Community quests in the admin (docs/quests.md): the running one with its contributors, the
// planned and past ones, and the templates the weekly rotation draws from.
import { AdminQuestsCommunityForm } from '#components';

const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const form = overlay.create(AdminQuestsCommunityForm);

const { data, error, refresh } = await useQuestsAdminCommunity();
const running = computed(() => data.value?.items.find((item) => item.status === 'running'));
const others = computed(() => data.value?.items.filter((item) => item.status !== 'running') ?? []);

const contributors = ref<{ username: string; amount: number; payout: number | null }[]>([]);
watch(
  running,
  async (value) => {
    contributors.value = value ? (await questAdminActions.contributors(value.id)).contributors : [];
  },
  { immediate: true },
);

const when = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Paris',
    }),
);

async function plan() {
  if (await form.open().result) await refresh();
}

async function cancel(id: string) {
  try {
    await questAdminActions.cancelCommunity(id);
    toast.add({
      title: t('admin.quests.community.cancelledToast'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await refresh();
  } catch {
    toast.add({
      title: t('admin.quests.errors.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}

const templateText = ref('');
async function addTemplate() {
  try {
    await questAdminActions.saveTemplate({ definition: JSON.parse(templateText.value) as unknown });
    templateText.value = '';
    toast.add({
      title: t('admin.quests.community.templateSaved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await refresh();
  } catch (error) {
    toast.add({
      title: t('admin.quests.errors.invalid'),
      description: error instanceof QuestError ? error.detail : undefined,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}
async function toggleTemplate(id: string, definition: unknown, enabled: boolean) {
  await questAdminActions.saveTemplate({ id, definition, enabled }).catch(() => undefined);
  await refresh();
}
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.quests.loadFailed')"
  />
  <div v-else-if="data" class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="max-w-2xl text-muted">{{ t('admin.quests.community.lede') }}</p>
      <UButton icon="i-lucide-plus" :label="t('admin.quests.community.new')" @click="plan" />
    </div>

    <template v-if="running">
      <QuestsCommunityBand :community="running" />
      <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-lg font-medium text-highlighted">
            {{ t('admin.quests.community.contributors') }}
          </h2>
          <UButton
            color="error"
            variant="outline"
            size="md"
            :label="t('admin.quests.community.cancel')"
            @click="cancel(running.id)"
          />
        </div>
        <p v-if="!contributors.length" class="text-muted">
          {{ t('admin.quests.community.noContributors') }}
        </p>
        <ol v-else class="flex flex-col divide-y divide-default">
          <li
            v-for="(row, index) in contributors"
            :key="row.username"
            class="flex items-center gap-3 py-2"
          >
            <span class="w-7 font-semibold text-muted tabular-nums">{{ index + 1 }}</span>
            <span class="flex-1">{{ row.username }}</span>
            <span class="text-sm tabular-nums">{{ formatLnbits(row.amount, locale) }}</span>
            <UBadge
              :color="
                row.amount >= Math.ceil((running.goal * running.thresholdPercent) / 100)
                  ? 'success'
                  : 'neutral'
              "
              :variant="
                row.amount >= Math.ceil((running.goal * running.thresholdPercent) / 100)
                  ? 'subtle'
                  : 'outline'
              "
              :label="
                row.amount >= Math.ceil((running.goal * running.thresholdPercent) / 100)
                  ? t('quests.community.qualified')
                  : t('quests.community.notQualified')
              "
            />
          </li>
        </ol>
      </section>
    </template>

    <section class="flex flex-col gap-3">
      <h2 class="text-lg font-medium text-highlighted">{{ t('admin.quests.community.others') }}</h2>
      <p v-if="!others.length" class="text-muted">{{ t('admin.quests.community.noOthers') }}</p>
      <ul v-else class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
        <li
          v-for="item in others"
          :key="item.id"
          class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
        >
          <span class="min-w-0 flex-1 font-semibold text-highlighted">{{
            questName(item.title, locale)
          }}</span>
          <span class="text-sm text-muted"
            >{{ when.format(new Date(item.startsAt)) }} –
            {{ when.format(new Date(item.endsAt)) }}</span
          >
          <UBadge
            color="neutral"
            variant="outline"
            :label="t(`admin.quests.community.status.${item.status}`)"
          />
          <UButton
            v-if="item.status === 'scheduled'"
            color="error"
            variant="outline"
            size="md"
            :label="t('admin.quests.community.cancel')"
            @click="cancel(item.id)"
          />
        </li>
      </ul>
    </section>

    <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5">
      <h2 class="text-lg font-medium text-highlighted">
        {{ t('admin.quests.community.templates') }}
      </h2>
      <p class="text-sm text-muted">{{ t('admin.quests.community.templatesHelp') }}</p>
      <ul v-if="data.templates.length" class="flex flex-col divide-y divide-default">
        <li
          v-for="template in data.templates"
          :key="template.id"
          class="flex items-center gap-3 py-2.5"
        >
          <span class="flex-1">
            {{
              questName(
                (template.definition as { title: { fr: string; en: string } }).title,
                locale,
              )
            }}
          </span>
          <USwitch
            :model-value="template.enabled"
            :aria-label="t('admin.quests.community.toggleTemplate')"
            @update:model-value="
              (value: boolean) => toggleTemplate(template.id, template.definition, value)
            "
          />
        </li>
      </ul>
      <UFormField :label="t('admin.quests.community.templateJson')" name="template">
        <UTextarea
          v-model="templateText"
          :rows="5"
          class="w-full"
          :placeholder="t('admin.quests.community.templatePlaceholder')"
        />
      </UFormField>
      <UButton
        class="self-start"
        color="neutral"
        variant="soft"
        :disabled="!templateText.trim()"
        :label="t('admin.quests.community.addTemplate')"
        @click="addTemplate"
      />
    </section>
  </div>
</template>
