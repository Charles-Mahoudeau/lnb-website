<script setup lang="ts">
// Deleting a Feed post or reply as a moderator (docs/feed.md, "Moderation"): says what deleting
// does, takes an optional reason, and confirms with the outline destructive button. Closes with
// the reason ('' for none), or null. The viewer's own post is deleted as its author: no reason
// is kept and nothing is audited, so the dialog asks for none and says so.
const props = defineProps<{ reply: boolean; replies: number; own?: boolean }>();
const emit = defineEmits<{ close: [reason: string | null] }>();

const { t } = useI18n();
const reason = ref('');
</script>

<template>
  <UModal
    :title="t(props.reply ? 'admin.feed.delete.replyTitle' : 'admin.feed.delete.postTitle')"
    :description="
      props.reply
        ? t('admin.feed.delete.replyText')
        : t('admin.feed.delete.postText', { count: props.replies }, props.replies)
    "
    :close="false"
  >
    <template #body>
      <form id="feed-admin-delete" @submit.prevent="emit('close', props.own ? '' : reason.trim())">
        <p v-if="props.own" class="text-sm text-muted">{{ t('admin.feed.delete.ownText') }}</p>
        <UFormField
          v-else
          :label="t('admin.feed.delete.reason')"
          :help="t('admin.feed.delete.reasonHelp')"
          name="reason"
        >
          <UTextarea v-model="reason" :maxlength="500" :rows="2" autoresize class="w-full" />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('admin.feed.delete.cancel')"
          @click="emit('close', null)"
        />
        <UButton
          type="submit"
          form="feed-admin-delete"
          color="error"
          variant="outline"
          icon="i-lucide-trash-2"
          :label="t('admin.feed.delete.confirm')"
        />
      </div>
    </template>
  </UModal>
</template>
