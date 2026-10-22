import type { WardenActorView, WardenAuditView } from '#shared/schemas/warden';

/** Words for who did what in Warden, shared by the admin pages. */
export function useWardenLabels() {
  const { t, locale } = useI18n();

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

  function action(entry: WardenAuditView): string {
    const data = entry.data;
    const text = (key: string) => (typeof data[key] === 'string' ? data[key] : '');
    switch (entry.action) {
      case 'link':
      case 'unlink':
        return t(`wardenAdmin.actions.${entry.action}`, { username: text('username') });
      case 'link.transfer':
        return t('wardenAdmin.actions.linkTransfer', { username: text('username') });
      case 'transfer.dismiss':
        return t('wardenAdmin.actions.transferDismiss', { username: text('username') });
      case 'link.request':
        return t('wardenAdmin.actions.linkRequest', { username: text('username') });
      case 'link.cancel':
        return t('wardenAdmin.actions.linkCancel', { username: text('username') });
      case 'uuid.collision':
        return t('wardenAdmin.actions.uuidCollision', { username: text('username') });
      case 'ban':
        return text('expiresAt')
          ? t('wardenAdmin.actions.banFor', {
              date: formatWardenDateTime(text('expiresAt'), locale.value),
            })
          : t('wardenAdmin.actions.banPermanent');
      case 'appeal.decide':
        return t(
          data.accepted
            ? 'wardenAdmin.actions.appealAccepted'
            : 'wardenAdmin.actions.appealRejected',
        );
      case 'limit.set':
        return typeof data.maxAccounts === 'number'
          ? t('wardenAdmin.actions.limitSet', { count: data.maxAccounts })
          : t('wardenAdmin.actions.limitReset');
      case 'role.set':
        return t(data.on ? 'wardenAdmin.actions.roleOn' : 'wardenAdmin.actions.roleOff');
      case 'identity.update':
        return t(
          data.showRealName
            ? 'wardenAdmin.actions.identityShown'
            : 'wardenAdmin.actions.identityHidden',
        );
      case 'device.link':
      case 'device.deny':
      case 'device.revoke': {
        const key = entry.action.replace(/\.(\w)/g, (_, c: string) => c.toUpperCase());
        return t(`wardenAdmin.actions.${key}`, { device: text('deviceName') });
      }
      case 'mod.add':
      case 'mod.promote':
      case 'mod.edit':
      case 'mod.convert':
      case 'mod.refresh':
      case 'mod.remove':
      case 'mod.restore':
      case 'mod.delete': {
        const key = `mod${entry.action.charAt(4).toUpperCase()}${entry.action.slice(5)}`;
        return t(`wardenAdmin.actions.${key}`, { name: text('name') });
      }
      default: {
        // token.rotate becomes tokenRotate, and so on.
        const key = entry.action.replace(/\.(\w)/g, (_, c: string) => c.toUpperCase());
        return t(`wardenAdmin.actions.${key}`);
      }
    }
  }

  return { actor, source, action };
}
