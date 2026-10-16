<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';

// The header's account menu: who's signed in, shortcuts as icon tiles with a description (like the
// Minecraft menu), and sign out as an outline button (docs/design.md).
const props = defineProps<{
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    tenantId: string;
    role?: string | null;
  };
}>();

const { t } = useI18n();
const { signOut } = useAuth();

const school = computed(() => schoolForTenant(props.user.tenantId));
// Microsoft names start with the first name, as shortName() on the server assumes too.
const firstName = computed(() => props.user.name.trim().split(/\s+/)[0]);

// Warden (Minecraft) is open to some schools only.
const wardenApp = getLinkApp('warden');
const { isEnabled } = useFlags();
const canUseWarden = computed(
  () => isEnabled('warden') && !!wardenApp && canLinkFromSchool(wardenApp, props.user.tenantId),
);

const items = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t('account.title'),
      description: t('account.menu.account'),
      icon: 'i-lucide-user',
      to: '/account',
    },
    ...(canUseWarden.value
      ? [
          {
            label: t('warden.title'),
            description: t('account.menu.warden'),
            icon: 'i-lucide-pickaxe',
            to: '/minecraft/warden',
          },
        ]
      : []),
    ...(isWardenAdmin(props.user.role)
      ? [
          {
            label: t('admin.menu'),
            description: t('account.menu.admin'),
            icon: 'i-lucide-shield',
            to: '/admin',
          },
        ]
      : []),
  ],
  [
    {
      label: t('auth.signOut'),
      slot: 'sign-out' as const,
      class: 'justify-center rounded-md ring ring-accented ring-inset',
      onSelect: () => void signOut(),
    },
  ],
]);
</script>

<template>
  <UDropdownMenu
    :items="items"
    size="lg"
    :content="{ align: 'end' }"
    :ui="{
      content: 'w-80',
      group: 'p-1.5',
      item: 'items-center gap-3',
      itemLabel: 'font-semibold text-highlighted',
      itemDescription: 'text-sm',
    }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      size="lg"
      trailing-icon="i-lucide-chevron-down"
      :aria-label="t('auth.accountMenu')"
      :ui="{ trailingIcon: 'size-4 text-muted' }"
    >
      <UAvatar
        :src="user.image ?? undefined"
        :alt="user.name"
        size="sm"
        :ui="avatarTint(user.id)"
      />
      <span class="max-sm:hidden">{{ firstName }}</span>
    </UButton>

    <template #content-top>
      <div class="flex items-center gap-3 border-b border-default p-4">
        <UAvatar
          :src="user.image ?? undefined"
          :alt="user.name"
          size="xl"
          :ui="avatarTint(user.id)"
          class="text-base"
        />
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="truncate font-semibold text-highlighted">{{ user.name }}</span>
          <span class="truncate text-sm text-muted">{{ user.email }}</span>
          <UBadge
            v-if="school"
            :label="school"
            color="neutral"
            variant="soft"
            size="sm"
            class="mt-1 self-start"
          />
        </div>
      </div>
    </template>

    <template #item-leading="{ item }">
      <IconTile v-if="item.icon" :icon="item.icon" />
    </template>

    <template #sign-out>
      <span class="flex items-center gap-2 font-medium">
        <UIcon name="i-lucide-log-out" class="size-5" />
        {{ t('auth.signOut') }}
      </span>
    </template>
  </UDropdownMenu>
</template>
