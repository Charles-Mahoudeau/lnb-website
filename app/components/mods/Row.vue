<script setup lang="ts">
import type { ModView } from '#shared/schemas/mods';

// One mod in a tab: icon, name, summary, the reason when it was suggested, and the vote.
const props = defineProps<{
  mod: ModView;
  /** Why the viewer can't vote, other than it being their own mod. Null when they can. */
  blocked: string | null;
  pending?: boolean;
}>();

const emit = defineEmits<{ vote: [value: -1 | 0 | 1]; edit: []; withdraw: [] }>();

const { t, locale } = useI18n();

const sourceLabel = computed(() => t(`mods.sources.${props.mod.source}`));
const voteBlocked = computed(() => (props.mod.mine ? t('mods.vote.own') : props.blocked));
</script>

<template>
  <li class="flex items-start gap-4 rounded-lg bg-elevated p-4">
    <ModsIcon :name="props.mod.name" :src="props.mod.iconUrl" />
    <!-- The vote wraps under the text on phones; the icon stays beside it. -->
    <div class="flex min-w-0 grow flex-wrap items-start gap-x-4 gap-y-3">
      <div class="flex min-w-0 grow basis-64 flex-col gap-1.5">
        <div class="flex flex-wrap items-center gap-2">
          <ULink
            :to="props.mod.pageUrl"
            target="_blank"
            rel="noopener"
            class="text-lg font-bold text-highlighted hover:underline"
          >
            {{ props.mod.name }}
          </ULink>
          <UBadge color="neutral" variant="soft" size="sm" :label="sourceLabel" />
          <UBadge
            v-if="props.mod.mine"
            color="neutral"
            variant="outline"
            size="sm"
            :label="t('mods.row.yours')"
          />
        </div>
        <p v-if="props.mod.summary" class="text-muted">{{ props.mod.summary }}</p>
        <div
          v-if="props.mod.reason"
          class="mt-1 flex max-w-prose flex-col gap-1 rounded-sm bg-accented px-3 py-2"
        >
          <p class="text-default">{{ props.mod.reason }}</p>
          <p class="text-sm text-muted">
            {{
              t('mods.row.suggestedBy', {
                name: props.mod.proposerName ?? t('mods.row.formerMember'),
                when: formatWardenRelative(props.mod.createdAt, locale),
              })
            }}
          </p>
        </div>
        <div v-if="props.mod.mine && props.mod.list === 'suggestion'" class="flex gap-1">
          <UButton
            size="md"
            color="neutral"
            variant="ghost"
            :label="t('mods.row.editReason')"
            @click="emit('edit')"
          />
          <UButton
            size="md"
            color="neutral"
            variant="ghost"
            :label="t('mods.row.withdraw')"
            @click="emit('withdraw')"
          />
        </div>
      </div>
      <ModsVoteControl
        :score="props.mod.score"
        :up="props.mod.up"
        :down="props.mod.down"
        :my-vote="props.mod.myVote"
        :name="props.mod.name"
        :blocked="voteBlocked"
        :pending="props.pending"
        @vote="emit('vote', $event)"
      />
    </div>
  </li>
</template>
