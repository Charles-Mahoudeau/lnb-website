import type { WardenActorView } from '#shared/schemas/warden';

/** Words for who did what in Warden, shared by the admin pages. */
export function useWardenLabels() {
  const { t } = useI18n();

  function actor(view: WardenActorView): string {
    switch (view.kind) {
      case 'user':
        return view.name ?? view.userId;
      case 'minecraft':
        return view.name
          ? t('wardenAdmin.actors.asMinecraft', { name: view.name, username: view.username })
          : view.username;
      case 'console':
        return t('wardenAdmin.actors.console');
      case 'system':
        return t('wardenAdmin.actors.system');
    }
  }

  function source(value: 'web' | 'minecraft' | 'system'): string {
    return t(`wardenAdmin.sources.${value}`);
  }

  return { actor, source };
}
