<script setup lang="ts">
import { AdminPartnersModal, WardenConfirmModal } from '#components';

import { PARTNER_KINDS, PARTNER_KIND_ICONS } from '#shared/schemas/partners';
import type { PartnerAdminItem } from '#shared/schemas/partners';

// The partners: one section per kind (the contact link is in Settings, Partners). Order is set with the arrows, and a
// switch hides a partner without deleting it.
const { t } = useI18n();
const toast = useToast();
const overlay = useOverlay();

const { data, error, refresh } = await useAdminPartners();

const partners = computed(() => data.value?.partners ?? []);
const sections = computed(() =>
  PARTNER_KINDS.map((kind) => ({
    kind,
    partners: partners.value.filter((partner) => partner.kind === kind),
  })),
);

const modal = overlay.create(AdminPartnersModal);
const confirm = overlay.create(WardenConfirmModal);

function fail(caught: unknown) {
  const problem = caught instanceof PartnerError ? caught.problem : 'failed';
  toast.add({
    title: t(`admin.partners.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

/** Runs a change, then reloads the list whatever happens, so the page shows what is stored. */
async function run(change: () => Promise<unknown>, done?: string) {
  try {
    await change();
    if (done) toast.add({ title: t(done), color: 'success', icon: 'i-lucide-circle-check' });
  } catch (caught) {
    fail(caught);
  }
  await refresh();
}

async function onEdit(partner: PartnerAdminItem) {
  if (await modal.open({ partner }).result) await refresh();
}

async function onDelete(partner: PartnerAdminItem) {
  const confirmed: unknown = await confirm.open({
    title: t('admin.partners.deleteTitle', { name: partner.name }),
    description: t('admin.partners.deleteLede'),
    confirmLabel: t('admin.partners.delete'),
    cancelLabel: t('admin.cancel'),
    destructive: true,
  }).result;
  if (confirmed === true)
    await run(() => partnerActions.remove(partner.id), 'admin.partners.partner.deleted');
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.partners.errors.failed')"
  />
  <div v-else class="flex max-w-4xl flex-col gap-8">
    <p class="text-muted">{{ t('admin.partners.note') }}</p>

    <p v-if="!partners.length" class="rounded-lg bg-elevated p-6 text-muted">
      {{ t('admin.partners.empty') }}
    </p>

    <section
      v-for="section in sections"
      :key="section.kind"
      class="flex flex-col gap-3 rounded-lg bg-elevated p-5"
    >
      <div class="flex items-center gap-3">
        <IconTile :icon="PARTNER_KIND_ICONS[section.kind]" />
        <div class="flex min-w-0 flex-1 flex-col">
          <h2 class="text-xl font-bold text-highlighted">
            {{ t(`partners.kinds.${section.kind}.name`) }}
          </h2>
          <p class="text-sm text-muted">
            {{
              t(
                'admin.partners.kindCount',
                { count: section.partners.length },
                section.partners.length,
              )
            }}
          </p>
        </div>
      </div>

      <ul v-if="section.partners.length" class="flex flex-col gap-1">
        <li
          v-for="(partner, index) in section.partners"
          :key="partner.id"
          class="flex flex-wrap items-center gap-3 rounded-md bg-default px-3 py-2"
        >
          <PartnersLogo :name="partner.name" :src="partner.logo" size="small" />
          <div class="flex min-w-0 flex-1 flex-col">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-highlighted">{{ partner.name }}</span>
              <UBadge
                v-if="!partner.visible"
                color="neutral"
                variant="soft"
                size="sm"
                :label="t('admin.partners.badges.hidden')"
              />
            </div>
            <span class="truncate text-sm text-muted">{{ partner.description.en }}</span>
          </div>
          <USwitch
            :model-value="partner.visible"
            :aria-label="t('admin.partners.partner.visible')"
            @update:model-value="
              (visible) => run(() => partnerActions.update(partner.id, { visible }))
            "
          />
          <div class="flex items-center gap-1">
            <UButton
              icon="i-lucide-arrow-up"
              size="md"
              color="neutral"
              variant="ghost"
              :aria-label="t('admin.partners.moveUp')"
              :disabled="index === 0"
              @click="run(() => partnerActions.move(partner.id, 'up'))"
            />
            <UButton
              icon="i-lucide-arrow-down"
              size="md"
              color="neutral"
              variant="ghost"
              :aria-label="t('admin.partners.moveDown')"
              :disabled="index === section.partners.length - 1"
              @click="run(() => partnerActions.move(partner.id, 'down'))"
            />
            <UButton
              size="md"
              color="neutral"
              variant="ghost"
              :label="t('admin.partners.edit')"
              @click="onEdit(partner)"
            />
            <UButton
              size="md"
              color="error"
              variant="outline"
              :label="t('admin.partners.delete')"
              @click="onDelete(partner)"
            />
          </div>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">{{ t('admin.partners.noneInKind') }}</p>
    </section>
  </div>
</template>
