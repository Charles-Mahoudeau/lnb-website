<script setup lang="ts">
import type { FormError } from '@nuxt/ui';

import type { FeedPostView } from '#shared/schemas/feed';
import { FEED_TEXT_MAX, checkFeedText } from '#shared/utils/feed-text';

// The reply composer under a thread (docked at the bottom on phones): whom it answers, with a
// cross to answer the main post instead, the text and its counter, "Reply anonymously" and Reply.
// It posts from the same account as the composer of the feed. A failed send keeps the draft and its
// key, so sending it again can't post twice.
const props = defineProps<{
  threadId: string;
  /** The display name of the main post's author ("Anonymous" for an anonymous one). */
  mainName: string;
  /** The reply answered, or null for the main post. */
  target: { id: string; name: string } | null;
}>();
const emit = defineEmits<{ posted: [post: FeedPostView]; clear: []; gone: [] }>();

const { t } = useI18n();
const toasts = useFeedToasts();

const sending = ref(false);
const state = reactive({ text: '', anonymous: false });
const checked = computed(() => checkFeedText(state.text));
const over = computed(() => checked.value.length > FEED_TEXT_MAX);
/** Screen readers hear the counter only from 20 characters before the limit. */
const near = computed(() => checked.value.length >= FEED_TEXT_MAX - 20);
const textarea = useTemplateRef<{ textareaRef?: HTMLTextAreaElement | null }>('textarea');

defineExpose({
  focus: () => textarea.value?.textareaRef?.focus(),
});

function validate(): FormError[] {
  const result = checkFeedText(state.text);
  if (result.ok) return [];
  return [{ name: 'text', message: t(`feed.errors.${result.problem}`) }];
}

let attempt: ReturnType<typeof feedDraftKey> | null = null;

async function onSubmit() {
  if (!checked.value.ok || sending.value) return;
  const replyTo = props.target?.id ?? null;
  attempt = feedDraftKey(attempt, {
    target: `${props.threadId}:${replyTo ?? ''}`,
    text: state.text,
    anonymous: state.anonymous,
  });
  sending.value = true;
  try {
    const { post } = await feedActions.reply(props.threadId, {
      idempotencyKey: attempt.key,
      replyTo,
      text: state.text,
      anonymous: state.anonymous,
    });
    attempt = null;
    state.text = '';
    state.anonymous = false;
    toasts.done(t('feed.thread.replied'));
    emit('posted', post);
  } catch (error) {
    if (error instanceof FeedError && error.problem === 'notFound') {
      // The thread, the reply answered or the key's own reply is gone: the draft can't be sent
      // as it is, so it goes, and the page reads the thread again (docs/feed-mod.md).
      attempt = null;
      state.text = '';
      state.anonymous = false;
      toasts.failed(error);
      emit('gone');
      return;
    }
    // The draft and its key stay: sending it again answers the same reply if this one went.
    toasts.failed(error, { send: true });
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <UForm
    :state="state"
    :validate="validate"
    :validate-on="[]"
    class="flex flex-col gap-2.5"
    :aria-label="t('feed.thread.replyLabel')"
    @submit="onSubmit"
  >
    <p class="flex min-w-0 items-center gap-1.5 text-sm text-muted">
      <UIcon name="i-lucide-corner-down-right" class="size-4 shrink-0" />
      <span class="truncate">
        {{ t('feed.post.replyTo', { name: props.target?.name ?? props.mainName }) }}
      </span>
      <UButton
        v-if="props.target"
        color="neutral"
        variant="ghost"
        size="xs"
        square
        icon="i-lucide-x"
        class="text-muted"
        :aria-label="t('feed.thread.replyToMain')"
        @click="emit('clear')"
      />
    </p>
    <UFormField name="text" :ui="{ error: 'text-sm' }">
      <UTextarea
        ref="textarea"
        v-model="state.text"
        :placeholder="t('feed.thread.placeholder')"
        :aria-label="t('feed.thread.replyLabel')"
        :rows="2"
        autoresize
        :maxrows="8"
        class="w-full"
      />
    </UFormField>
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
      <USwitch
        v-model="state.anonymous"
        :label="t('feed.thread.anonymous')"
        :description="t('feed.composer.hidden')"
      />
      <div class="ms-auto flex items-center gap-3">
        <span
          :class="['text-sm tabular-nums', over ? 'font-semibold text-error' : 'text-muted']"
          :aria-live="near ? 'polite' : 'off'"
        >
          {{ t('feed.composer.counter', { count: checked.length, max: FEED_TEXT_MAX }) }}
        </span>
        <UButton
          type="submit"
          :label="t('feed.thread.reply')"
          :loading="sending"
          :disabled="!checked.ok"
        />
      </div>
    </div>
  </UForm>
</template>
