<script setup lang="ts">
import { AdminShortLinksForm, WardenConfirmModal } from '#components';

// One short link: where it goes, who can open it, its numbers, and who clicked when it records.
const props = defineProps<{ id: string }>();
const { t, d } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const { data, error, refresh } = await useAdminShortLink(props.id);
const { data: list } = await useAdminShortLinks();

const drawer = overlay.create(AdminShortLinksForm);
const confirm = overlay.create(WardenConfirmModal);

const baseUrl = computed(() => list.value?.baseUrl ?? '');
const url = computed(() => (data.value ? shortUrl(baseUrl.value, data.value.shortId) : ''));
const schools = computed(() => schoolNames(data.value?.tenantIds ?? []));

function fail(caught: unknown) {
  const problem = caught instanceof ShortLinkError ? caught.problem : 'failed';
  toast.add({
    title: t(`admin.shortLinks.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

async function copy() {
  await navigator.clipboard.writeText(url.value);
  toast.add({
    title: t('admin.shortLinks.copied'),
    color: 'success',
    icon: 'i-lucide-circle-check',
  });
}

async function onToggle(enabled: boolean) {
  try {
    await shortLinkActions.update(props.id, { enabled });
  } catch (caught) {
    fail(caught);
  }
  await refresh();
}

async function onEdit() {
  if (!data.value) return;
  if (await drawer.open({ link: data.value }).result) await refresh();
}

async function onDelete() {
  if (!data.value) return;
  const confirmed: unknown = await confirm.open({
    title: t('admin.shortLinks.deleteTitle', { id: data.value.shortId }),
    description: t('admin.shortLinks.deleteLede'),
    confirmLabel: t('admin.shortLinks.delete'),
    cancelLabel: t('admin.cancel'),
    destructive: true,
  }).result;
  if (confirmed !== true) return;
  try {
    await shortLinkActions.remove(props.id);
    toast.add({
      title: t('admin.shortLinks.deleted'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await navigateTo('/admin/short-links');
  } catch (caught) {
    fail(caught);
  }
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.shortLinks.errors.failed')"
  />
  <div v-else class="flex max-w-4xl flex-col gap-6">
    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-1">
          <h2 class="text-xl font-bold break-all text-highlighted">{{ url }}</h2>
          <p class="text-sm text-muted">{{ data.name }}</p>
          <p class="text-sm break-all text-muted">{{ data.destinationUrl }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <USwitch
            :model-value="data.enabled"
            :aria-label="t('admin.shortLinks.form.enabled')"
            @update:model-value="onToggle"
          />
          <UButton
            icon="i-lucide-copy"
            size="md"
            color="neutral"
            variant="soft"
            :label="t('admin.shortLinks.copy')"
            @click="copy"
          />
          <UButton
            icon="i-lucide-pencil"
            size="md"
            :label="t('admin.shortLinks.edit')"
            @click="onEdit"
          />
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <UBadge
          :color="data.access === 'any' ? 'neutral' : 'secondary'"
          variant="soft"
          :icon="data.access === 'any' ? 'i-lucide-globe' : 'i-lucide-lock'"
          :label="
            data.access === 'schools'
              ? t('admin.shortLinks.detail.onlySchools', { schools: schools.join(', ') })
              : t(`admin.shortLinks.detail.access.${data.access}`)
          "
        />
        <UBadge
          color="neutral"
          variant="soft"
          :icon="data.recordClicks ? 'i-lucide-eye' : undefined"
          :label="
            t(
              data.recordClicks
                ? 'admin.shortLinks.detail.records'
                : 'admin.shortLinks.detail.countsOnly',
            )
          "
        />
        <UBadge
          v-if="!data.enabled"
          color="neutral"
          variant="soft"
          :label="t('admin.shortLinks.off')"
        />
      </div>
    </section>

    <UAlert
      v-if="data.recordClicks && data.trackingOff"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="t('admin.shortLinks.detail.trackingOff')"
    />

    <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-lg bg-elevated p-4">
        <dd class="font-display text-2xl font-medium text-highlighted tabular-nums">
          {{ data.clicks }}
        </dd>
        <dt class="text-sm text-muted">{{ t('admin.shortLinks.detail.clicks') }}</dt>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <dd class="font-display text-2xl font-medium text-highlighted tabular-nums">
          {{ data.recordClicks ? data.people : '-' }}
        </dd>
        <dt class="text-sm text-muted">
          {{
            t(
              data.recordClicks
                ? 'admin.shortLinks.detail.people'
                : 'admin.shortLinks.detail.peopleNotRecorded',
            )
          }}
        </dt>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <dd class="font-display text-2xl font-medium text-highlighted tabular-nums">
          {{ data.anonymousClicks }}
        </dd>
        <dt class="text-sm text-muted">{{ t('admin.shortLinks.detail.anonymous') }}</dt>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <dd class="font-display text-2xl font-medium text-highlighted tabular-nums">
          {{ data.refused }}
        </dd>
        <dt class="text-sm text-muted">{{ t('admin.shortLinks.detail.refused') }}</dt>
      </div>
    </dl>

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-xl font-bold text-highlighted">
          {{ t('admin.shortLinks.detail.perDay') }}
        </h2>
        <ul class="flex gap-4 text-sm text-muted">
          <li class="flex items-center gap-1.5">
            <svg class="size-2.5" viewBox="0 0 10 10" aria-hidden="true">
              <rect width="10" height="10" rx="2" class="fill-current text-highlighted" />
            </svg>
            {{ t('admin.shortLinks.detail.signedIn') }}
          </li>
          <li class="flex items-center gap-1.5">
            <svg class="size-2.5" viewBox="0 0 10 10" aria-hidden="true">
              <rect width="10" height="10" rx="2" class="fill-current text-dimmed" />
            </svg>
            {{ t('admin.shortLinks.detail.notSignedIn') }}
          </li>
        </ul>
      </div>
      <AdminShortLinksChart :days="data.days" />
    </section>

    <div v-if="data.recordClicks" class="grid gap-6 md:grid-cols-3">
      <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
        <h2 class="text-xl font-bold text-highlighted">
          {{ t('admin.shortLinks.detail.bySchool') }}
        </h2>
        <p v-if="!data.schools.length" class="text-sm text-muted">
          {{ t('admin.shortLinks.detail.nobody') }}
        </p>
        <ul v-else class="flex flex-col gap-3">
          <li v-for="entry in data.schools" :key="entry.school" class="flex flex-col gap-1">
            <div class="flex justify-between text-sm">
              <span>{{ entry.school }}</span>
              <span class="text-muted tabular-nums">{{ entry.people }}</span>
            </div>
            <UProgress :model-value="entry.people" :max="data.people" size="sm" color="neutral" />
          </li>
        </ul>
      </section>

      <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5 md:col-span-2">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-xl font-bold text-highlighted">
            {{ t('admin.shortLinks.detail.whoClicked') }}
          </h2>
          <UButton
            :to="`/api/admin/short-links/${data.id}/export`"
            external
            size="md"
            color="neutral"
            variant="outline"
            icon="i-lucide-download"
            :label="t('admin.shortLinks.detail.export')"
          />
        </div>
        <p v-if="!data.recent.length" class="text-sm text-muted">
          {{ t('admin.shortLinks.detail.nobody') }}
        </p>
        <ul v-else class="flex flex-col divide-y divide-default">
          <li
            v-for="person in data.recent"
            :key="person.userId"
            class="flex items-center gap-3 py-2.5"
          >
            <UAvatar
              :src="person.image ?? undefined"
              :alt="person.name"
              :ui="avatarTint(person.userId)"
            />
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate font-semibold text-highlighted">{{ person.name }}</span>
              <span class="text-sm text-muted">{{ person.school }}</span>
            </div>
            <div class="text-right text-sm text-muted tabular-nums">
              {{ t('admin.shortLinks.detail.clickCount', { count: person.clicks }, person.clicks) }}
              <br />
              {{
                d(person.lastAt, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Europe/Paris',
                })
              }}
            </div>
          </li>
        </ul>
        <p class="text-sm text-muted">
          {{
            t('admin.shortLinks.detail.shown', { shown: data.recent.length, total: data.people })
          }}
        </p>
      </section>
    </div>
    <UAlert
      v-else
      color="neutral"
      variant="soft"
      icon="i-lucide-info"
      :description="
        t(
          data.access === 'any'
            ? 'admin.shortLinks.detail.hintAny'
            : 'admin.shortLinks.detail.hintEnable',
        )
      "
    />

    <div>
      <UButton
        color="error"
        variant="outline"
        :label="t('admin.shortLinks.delete')"
        @click="onDelete"
      />
    </div>
  </div>
</template>
