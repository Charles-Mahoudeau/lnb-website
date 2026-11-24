<script setup lang="ts">
// The "Announcer" pill of the Person page's header (docs/feed.md, "Granting the announcer role"),
// for moderators: the person holds the role, or a moderator role that implies it.
const props = defineProps<{ userId: string }>();

const { t } = useI18n();
const { data } = await useFeedAnnouncer(props.userId);
</script>

<template>
  <UBadge
    v-if="data?.announcer"
    color="neutral"
    variant="soft"
    :label="t('admin.feed.announcer.pill')"
  />
</template>
