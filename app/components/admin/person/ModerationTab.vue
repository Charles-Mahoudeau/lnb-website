<script setup lang="ts">
// The Moderation tab of the Person page: bans, warnings and notes in one timeline, newest first.
const props = defineProps<{ userId: string }>();
const { t, locale } = useI18n();
const labels = useWardenLabels();
const { data, error } = await useWardenAdminPlayer(props.userId).player;

/** Bans and notes in one timeline, newest first. */
const timeline = computed(() => {
  if (!data.value) return [];
  return [
    ...data.value.bans.map((ban) => ({ kind: 'ban' as const, at: ban.createdAt, ban })),
    ...data.value.notes.map((note) => ({ kind: 'note' as const, at: note.createdAt, note })),
  ].sort((a, b) => b.at.localeCompare(a.at));
});

function dateTime(iso: string) {
  return formatWardenDateTime(iso, locale.value);
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('wardenAdmin.player.loadFailed')"
  />
  <div v-else class="flex flex-col gap-10">
    <section class="flex flex-col gap-4">
      <h2 class="text-2xl font-medium text-highlighted">
        {{ t('wardenAdmin.player.moderation') }}
      </h2>
      <p v-if="!timeline.length" class="text-muted">
        {{ t('wardenAdmin.player.noModeration') }}
      </p>
      <ul v-else class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
        <li
          v-for="item in timeline"
          :key="item.kind + (item.kind === 'ban' ? item.ban.id : item.note.id)"
          class="flex gap-4 px-5 py-4"
        >
          <span class="grid size-8 shrink-0 place-items-center rounded-full bg-accented text-muted">
            <UIcon
              :name="
                item.kind === 'ban'
                  ? 'i-lucide-ban'
                  : item.note.kind === 'warning'
                    ? 'i-lucide-triangle-alert'
                    : 'i-lucide-notebook-pen'
              "
              class="size-4"
            />
          </span>
          <div v-if="item.kind === 'ban'" class="flex min-w-0 flex-col gap-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-highlighted">
                {{
                  item.ban.expiresAt
                    ? t('wardenAdmin.timeline.banFor', {
                        length: formatWardenBanLength(
                          item.ban.createdAt,
                          item.ban.expiresAt,
                          locale,
                        ),
                      })
                    : t('wardenAdmin.timeline.banPermanent')
                }}
              </span>
              <UBadge
                :color="item.ban.active ? 'error' : 'neutral'"
                variant="subtle"
                :label="
                  item.ban.active
                    ? t('wardenAdmin.timeline.active')
                    : item.ban.revoked
                      ? t('wardenAdmin.timeline.lifted')
                      : t('wardenAdmin.timeline.ended')
                "
              />
              <UBadge
                v-if="item.ban.appeal"
                :color="item.ban.appeal.status === 'pending' ? 'warning' : 'neutral'"
                variant="subtle"
                :label="
                  t(
                    item.ban.appeal.status === 'pending'
                      ? 'wardenAdmin.timeline.appealPending'
                      : item.ban.appeal.status === 'accepted'
                        ? 'wardenAdmin.timeline.appealAccepted'
                        : 'wardenAdmin.timeline.appealRejected',
                  )
                "
              />
            </div>
            <p class="break-words">{{ item.ban.reason }}</p>
            <RulesCited :rules="item.ban.rules" />
            <p class="text-sm text-muted">
              {{
                t('wardenAdmin.timeline.issued', {
                  actor: labels.actor(item.ban.issuedBy),
                  source: labels.source(item.ban.source),
                  date: dateTime(item.ban.createdAt),
                })
              }}
              <template v-if="item.ban.expiresAt && !item.ban.revoked">
                {{ t('wardenAdmin.timeline.ends', { date: dateTime(item.ban.expiresAt) }) }}
              </template>
            </p>
            <p v-if="item.ban.revoked" class="text-sm text-muted">
              {{
                t(
                  item.ban.revoked.reason
                    ? 'wardenAdmin.timeline.revokedWithReason'
                    : 'wardenAdmin.timeline.revoked',
                  {
                    actor: labels.actor(item.ban.revoked.by),
                    date: dateTime(item.ban.revoked.at),
                    reason: item.ban.revoked.reason ?? '',
                  },
                )
              }}
            </p>
            <template v-if="item.ban.appeal">
              <p class="border-l-2 border-default pl-3 text-sm whitespace-pre-line">
                {{ t('wardenAdmin.timeline.appeal', { body: item.ban.appeal.body }) }}
              </p>
              <p
                v-if="item.ban.appeal.response && item.ban.appeal.decidedBy"
                class="text-sm text-muted"
              >
                {{
                  t('wardenAdmin.timeline.appealResponse', {
                    actor: labels.actor(item.ban.appeal.decidedBy),
                    response: item.ban.appeal.response,
                  })
                }}
              </p>
            </template>
          </div>
          <div v-else class="flex min-w-0 flex-col gap-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-highlighted">
                {{
                  t(
                    item.note.kind === 'warning'
                      ? 'wardenAdmin.timeline.warning'
                      : 'wardenAdmin.timeline.note',
                  )
                }}
              </span>
              <UBadge
                color="neutral"
                variant="soft"
                :label="
                  t(
                    item.note.kind === 'warning'
                      ? 'wardenAdmin.timeline.seenByPlayer'
                      : 'wardenAdmin.timeline.adminsOnly',
                  )
                "
              />
            </div>
            <p class="break-words whitespace-pre-line">{{ item.note.body }}</p>
            <RulesCited :rules="item.note.rules" />
            <p class="text-sm text-muted">
              {{
                t('wardenAdmin.timeline.issued', {
                  actor: labels.actor(item.note.author),
                  source: labels.source(item.note.source),
                  date: dateTime(item.note.createdAt),
                })
              }}
            </p>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
