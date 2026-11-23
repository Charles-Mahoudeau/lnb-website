<script setup lang="ts">
import type { DropdownMenuItem, FormError } from '@nuxt/ui';

import type { FeedMe, FeedName, FeedPostView } from '#shared/schemas/feed';
import { FEED_TEXT_MAX, checkFeedText } from '#shared/utils/feed-text';

// The composer at the top of the Feed (docs/feed.md, "The Feed page"): collapsed, the posting
// account's head and a prompt; open, the author row with "Change account" for people with several
// linked accounts, the text and its counter (counted as the site counts), where to post for
// announcers, the anonymous switch and Post. A failed send keeps the draft and its key, so sending
// it again can't post twice.
const props = defineProps<{ me: FeedMe; feed: FeedName }>();
const emit = defineEmits<{ posted: [post: FeedPostView]; account: [me: FeedMe] }>();

const { t } = useI18n();
const toasts = useFeedToasts();

const open = ref(false);
const sending = ref(false);
const switching = ref(false);
const state = reactive({ text: '', anonymous: false });
const destination = ref<FeedName>(props.feed);
watch(
  () => props.feed,
  (feed) => {
    if (!state.text) destination.value = feed;
  },
);
const textarea = useTemplateRef<{ textareaRef?: HTMLTextAreaElement | null }>('textarea');

const author = computed(() => props.me.me);
const announcer = computed(() => props.me.rights.announce);
const checked = computed(() => checkFeedText(state.text));
const over = computed(() => checked.value.length > FEED_TEXT_MAX);

async function expand() {
  open.value = true;
  await nextTick();
  textarea.value?.textareaRef?.focus();
}

const destinations = computed(() => [
  { value: 'announcements', label: t('feed.tabs.announcements') },
  { value: 'global', label: t('feed.tabs.global') },
]);

/** "Léa B. @Lea_Alt", or the username alone when the real name is hidden. */
function shownAs(username: string) {
  const realName = author.value?.realName ?? null;
  return [feedDisplayName({ realName, username }), feedHandle({ realName, username })]
    .filter(Boolean)
    .join(' ');
}

const accountItems = computed<DropdownMenuItem[]>(() => [
  { type: 'label', label: t('feed.composer.postWith') },
  ...props.me.accounts.map((account) => ({
    label: account.username,
    description: t('feed.composer.accountShows', { name: shownAs(account.username) }),
    type: 'checkbox' as const,
    checked: account.uuid === props.me.postingAccount,
    slot: 'account' as const,
    uuid: account.uuid,
    onSelect: () => void choose(account.uuid),
  })),
]);

async function choose(uuid: string) {
  if (uuid === props.me.postingAccount || switching.value) return;
  switching.value = true;
  try {
    const updated = await feedActions.setPostingAccount(uuid);
    emit('account', updated);
    if (updated.me) {
      toasts.done(t('feed.composer.accountChanged', { name: shownAs(updated.me.username) }));
    }
  } catch (error) {
    toasts.failed(error);
  } finally {
    switching.value = false;
  }
}

function validate(): FormError[] {
  const result = checkFeedText(state.text);
  if (result.ok) return [];
  return [{ name: 'text', message: t(`feed.errors.${result.problem}`) }];
}

let attempt: ReturnType<typeof feedDraftKey> | null = null;

async function onSubmit() {
  if (!checked.value.ok || sending.value) return;
  const feed = announcer.value ? destination.value : 'global';
  attempt = feedDraftKey(attempt, { target: feed, text: state.text, anonymous: state.anonymous });
  sending.value = true;
  try {
    const { post } = await feedActions.post({
      idempotencyKey: attempt.key,
      feed,
      text: state.text,
      anonymous: state.anonymous,
    });
    attempt = null;
    state.text = '';
    state.anonymous = false;
    open.value = false;
    toasts.done(t('feed.composer.posted'));
    emit('posted', post);
  } catch (error) {
    // The draft and its key stay: sending it again answers the same post if this one went.
    toasts.failed(error);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <section class="rounded-lg bg-elevated px-4 py-3.5 sm:px-5 sm:py-4">
    <div v-if="!open" class="flex items-center gap-3">
      <WardenMinecraftHead v-if="author" :uuid="author.uuid" />
      <UInput
        :placeholder="t('feed.composer.placeholder')"
        :aria-label="t('feed.composer.label')"
        class="min-w-0 flex-1"
        readonly
        @focus="expand"
        @click="expand"
      />
    </div>

    <UForm
      v-else
      :state="state"
      :validate="validate"
      :validate-on="[]"
      class="flex flex-col gap-3"
      @submit="onSubmit"
    >
      <div class="flex min-w-0 items-center gap-3">
        <template v-if="state.anonymous">
          <FeedAnonymousAvatar />
          <div class="flex min-w-0 flex-col leading-tight">
            <span class="font-semibold text-muted">{{ t('feed.post.anonymous') }}</span>
            <span class="truncate text-sm text-muted">{{ t('feed.composer.hidden') }}</span>
          </div>
        </template>
        <template v-else-if="author">
          <WardenMinecraftHead :uuid="author.uuid" />
          <div class="flex min-w-0 flex-col leading-tight">
            <span class="truncate font-semibold text-highlighted">
              {{ feedDisplayName(author) }}
            </span>
            <span v-if="feedHandle(author)" class="truncate text-sm text-muted">
              {{ feedHandle(author) }}
            </span>
          </div>
        </template>
        <UDropdownMenu
          v-if="props.me.accounts.length > 1"
          :items="accountItems"
          :content="{ align: 'end' }"
          :ui="{ content: 'w-80' }"
        >
          <UButton
            color="neutral"
            variant="ghost"
            size="md"
            trailing-icon="i-lucide-chevron-down"
            :label="t('feed.composer.changeAccount')"
            :loading="switching"
            class="ms-auto shrink-0"
          />
          <template #account-leading="{ item }">
            <WardenMinecraftHead :uuid="(item as { uuid: string }).uuid" size="sm" />
          </template>
        </UDropdownMenu>
      </div>

      <UFormField name="text" :ui="{ error: 'text-sm' }">
        <UTextarea
          ref="textarea"
          v-model="state.text"
          :placeholder="t('feed.composer.placeholder')"
          :aria-label="t('feed.composer.label')"
          :rows="3"
          autoresize
          :maxrows="10"
          class="w-full"
        />
      </UFormField>

      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div class="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
          <UTabs
            v-if="announcer"
            v-model="destination"
            :items="destinations"
            :content="false"
            variant="pill"
            size="sm"
            :aria-label="t('feed.composer.destination')"
          />
          <USwitch
            v-model="state.anonymous"
            :label="t('feed.composer.anonymous')"
            :description="t('feed.composer.anonymousHelp')"
          />
        </div>
        <div class="ms-auto flex items-center gap-3">
          <span
            :class="['text-sm tabular-nums', over ? 'font-semibold text-error' : 'text-muted']"
            aria-live="polite"
          >
            {{ t('feed.composer.counter', { count: checked.length, max: FEED_TEXT_MAX }) }}
          </span>
          <UButton
            type="submit"
            :label="t('feed.composer.post')"
            :loading="sending"
            :disabled="!checked.ok"
          />
        </div>
      </div>
    </UForm>
  </section>
</template>
