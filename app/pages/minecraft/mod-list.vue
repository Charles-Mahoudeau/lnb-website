<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';

import { ModsReasonModal, ModsSuggestModal, WardenConfirmModal } from '#components';

import type { ModView } from '#shared/schemas/mods';

// Public: anyone sees the list and the scores. Voting and suggesting need an account.
definePageMeta({ auth: false });

const { t } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const route = useRoute();

useSeoMeta({ title: () => t('mods.title'), description: () => t('mods.lede') });

const modList = useModList();
const { data, error, refresh } = await modList.page;

const tab = ref<'official' | 'suggestion'>('official');
const sort = ref<'top' | 'new'>('top');

const tabs = computed<TabsItem[]>(() => [
  {
    label: t('mods.tabs.official'),
    value: 'official',
    badge: { label: String(data.value?.official.length ?? 0), color: 'neutral', variant: 'soft' },
  },
  {
    label: t('mods.tabs.suggestions'),
    value: 'suggestion',
    badge: {
      label: String(data.value?.suggestions.length ?? 0),
      color: 'neutral',
      variant: 'soft',
    },
  },
]);

const mods = computed<ModView[]>(() => {
  const list = (tab.value === 'official' ? data.value?.official : data.value?.suggestions) ?? [];
  // The server sorts by score, then newest.
  if (sort.value === 'top' || tab.value === 'official') return list;
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

const signedIn = computed(() => data.value?.me !== null);
const open = computed(() => data.value?.settings.open ?? false);

/** Why the viewer can't vote or suggest, or null when they can. Signed out, they're sent to sign in. */
const blocked = computed(() => {
  if (!open.value) return t('mods.vote.closed');
  if (data.value?.me?.banned) return t('mods.vote.banned');
  return null;
});

function signIn() {
  return navigateTo({ path: '/sign-in', query: { redirect: route.fullPath } });
}

function showError(error: unknown) {
  const problem = error instanceof ModError ? error.problem : 'failed';
  toast.add({ title: t(`mods.errors.${problem}`), color: 'error', icon: 'i-lucide-circle-alert' });
}

const pendingVote = ref<number | null>(null);
async function onVote(mod: ModView, value: -1 | 0 | 1) {
  if (!signedIn.value) return signIn();
  pendingVote.value = mod.id;
  try {
    const counts = await modList.vote(mod.id, value);
    // Update the row in place rather than refetching, so the list doesn't jump while people vote.
    const page = data.value;
    if (page) {
      const patch = (list: ModView[]) =>
        list.map((item) => (item.id === mod.id ? { ...item, ...counts } : item));
      data.value = {
        ...page,
        official: patch(page.official),
        suggestions: patch(page.suggestions),
      };
    }
  } catch (failure) {
    showError(failure);
    await refresh();
  } finally {
    pendingVote.value = null;
  }
}

const suggestModal = overlay.create(ModsSuggestModal);
const reasonModal = overlay.create(ModsReasonModal);
const confirmModal = overlay.create(WardenConfirmModal);

async function onSuggest() {
  const page = data.value;
  if (!page) return;
  if (!page.me) return signIn();
  const added: unknown = await suggestModal.open({
    gameVersion: page.settings.gameVersion,
    loader: page.settings.loader,
    left: page.me.suggestionsLeft,
    max: page.me.maxSuggestions,
  }).result;
  if (added === true) {
    sort.value = 'new';
    await refresh();
  }
}

async function onEdit(mod: ModView) {
  const saved: unknown = await reasonModal.open({
    id: mod.id,
    name: mod.name,
    reason: mod.reason ?? '',
  }).result;
  if (saved === true) await refresh();
}

async function onWithdraw(mod: ModView) {
  const confirmed: unknown = await confirmModal.open({
    title: t('mods.withdraw.title', { name: mod.name }),
    description: t('mods.withdraw.body'),
    confirmLabel: t('mods.withdraw.confirm'),
    cancelLabel: t('mods.withdraw.keep'),
    destructive: true,
  }).result;
  if (confirmed !== true) return;
  try {
    await modList.withdraw(mod.id);
    toast.add({ title: t('mods.withdraw.done'), color: 'success', icon: 'i-lucide-circle-check' });
  } catch (failure) {
    showError(failure);
  }
  await refresh();
}

async function onDismiss(id: number) {
  try {
    await modList.dismissRemoval(id);
  } catch (failure) {
    showError(failure);
  }
  await refresh();
}
</script>

<template>
  <UContainer class="flex max-w-4xl flex-col gap-8 py-14">
    <div class="flex flex-col gap-3">
      <h1 class="text-4xl font-bold text-highlighted">{{ t('mods.title') }}</h1>
      <p class="max-w-xl text-lg text-muted">{{ t('mods.lede') }}</p>
      <div v-if="data" class="flex flex-wrap gap-2">
        <UBadge
          :color="open ? 'success' : 'neutral'"
          variant="subtle"
          :label="open ? t('mods.status.open') : t('mods.status.closed')"
        />
        <UBadge
          color="neutral"
          variant="soft"
          :label="
            t('mods.status.server', {
              loader: t(`mods.loaders.${data.settings.loader}`),
              version: data.settings.gameVersion,
            })
          "
        />
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('mods.loadFailed')"
    />

    <template v-else-if="data">
      <UAlert
        v-if="data.me?.banned"
        color="warning"
        variant="subtle"
        icon="i-lucide-ban"
        :description="t('mods.bannedNotice')"
      />

      <div class="flex flex-wrap items-center justify-between gap-3">
        <UTabs v-model="tab" :items="tabs" :content="false" class="w-auto" />
        <div
          v-if="tab === 'suggestion'"
          class="flex items-center gap-1"
          role="group"
          :aria-label="t('mods.sort.label')"
        >
          <span class="me-1 text-sm text-muted">{{ t('mods.sort.label') }}</span>
          <UButton
            size="md"
            color="neutral"
            :variant="sort === 'top' ? 'soft' : 'ghost'"
            :aria-pressed="sort === 'top'"
            :label="t('mods.sort.top')"
            @click="sort = 'top'"
          />
          <UButton
            size="md"
            color="neutral"
            :variant="sort === 'new' ? 'soft' : 'ghost'"
            :aria-pressed="sort === 'new'"
            :label="t('mods.sort.new')"
            @click="sort = 'new'"
          />
        </div>
      </div>

      <p v-if="tab === 'official'" class="text-muted">{{ t('mods.officialLede') }}</p>

      <ul v-if="mods.length" class="flex flex-col gap-2">
        <ModsRow
          v-for="mod in mods"
          :key="mod.id"
          :mod="mod"
          :blocked="blocked"
          :pending="pendingVote === mod.id"
          @vote="onVote(mod, $event)"
          @edit="onEdit(mod)"
          @withdraw="onWithdraw(mod)"
        />
      </ul>
      <div
        v-else
        class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-5 py-10 text-center"
      >
        <UIcon name="i-lucide-blocks" class="size-8 text-muted" />
        <p class="max-w-md text-muted">
          {{ tab === 'official' ? t('mods.empty.official') : t('mods.empty.suggestions') }}
        </p>
      </div>

      <template v-if="tab === 'suggestion'">
        <UAlert
          v-for="notice in data.me?.removed ?? []"
          :key="notice.id"
          color="neutral"
          variant="soft"
          icon="i-lucide-eye-off"
          :title="t('mods.removed.title', { name: notice.name })"
          :description="t('mods.removed.reason', { reason: notice.reason })"
          close
          @update:open="onDismiss(notice.id)"
        />

        <div class="flex flex-wrap items-center gap-4 rounded-lg bg-elevated p-5">
          <UIcon name="i-lucide-lightbulb" class="size-6 shrink-0 text-muted" />
          <div class="flex min-w-0 grow basis-64 flex-col gap-0.5">
            <span class="font-semibold text-highlighted">{{ t('mods.suggest.panelTitle') }}</span>
            <span class="text-muted">
              <template v-if="!open">{{ t('mods.suggest.panelClosed') }}</template>
              <template v-else-if="data.me">
                {{
                  t(
                    'mods.suggest.panelLeft',
                    { left: data.me.suggestionsLeft, max: data.me.maxSuggestions },
                    data.me.suggestionsLeft,
                  )
                }}
              </template>
              <template v-else>{{ t('mods.suggest.panelSignedOut') }}</template>
            </span>
          </div>
          <UButton
            icon="i-lucide-plus"
            :label="t('mods.suggest.open')"
            :disabled="!open || !!data.me?.banned || data.me?.suggestionsLeft === 0"
            @click="onSuggest"
          />
        </div>
      </template>
    </template>
  </UContainer>
</template>
