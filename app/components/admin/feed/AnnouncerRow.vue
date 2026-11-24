<script setup lang="ts">
// The "Feed announcer" row of the Person page's Minecraft tab (docs/feed.md, "Granting the
// announcer role"; mock M1): a switch for moderators. A moderator announces by role, so for them it
// stays on, disabled, and says why.
const props = defineProps<{ userId: string; name: string }>();

const { t } = useI18n();
const toast = useToast();
const { data, error } = await useFeedAnnouncer(props.userId);
const saving = ref(false);

async function onChange(announcer: boolean) {
  if (!data.value || data.value.viaRole) return;
  saving.value = true;
  try {
    // The header's pill reads the same data.
    data.value = await feedAdminActions.setAnnouncer(props.userId, announcer);
    toast.add({
      title: t(announcer ? 'admin.feed.announcer.given' : 'admin.feed.announcer.taken', {
        name: props.name,
      }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (failure) {
    const problem = failure instanceof FeedError ? failure.problem : 'failed';
    toast.add({
      title: t(
        `admin.feed.announcer.errors.${['impliedByRole', 'isGhost', 'notFound'].includes(problem) ? problem : 'failed'}`,
      ),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.feed.announcer.loadFailed')"
  />
  <div v-else class="flex max-w-xl items-start justify-between gap-6 rounded-lg bg-elevated p-5">
    <div class="flex min-w-0 flex-col gap-1">
      <span id="feed-announcer-label" class="font-semibold text-highlighted">
        {{ t('admin.feed.announcer.title') }}
      </span>
      <span id="feed-announcer-text" class="text-sm text-muted">
        {{ t('admin.feed.announcer.text') }}
      </span>
      <span v-if="data.viaRole" class="mt-1 flex items-center gap-1.5 text-sm text-muted">
        <UIcon name="i-lucide-shield-check" class="size-4 shrink-0" />
        {{ t('admin.feed.announcer.viaRole') }}
      </span>
    </div>
    <USwitch
      :model-value="data.announcer"
      :disabled="data.viaRole || saving"
      :loading="saving"
      aria-labelledby="feed-announcer-label"
      aria-describedby="feed-announcer-text"
      @update:model-value="onChange"
    />
  </div>
</template>
