import { WardenConfirmModal } from '#components';

/**
 * What the Person page's tabs and header share to act on someone: a confirm dialog, and a runner
 * that toasts the result and reloads what the page shows.
 */
export function usePersonRun(userId: string) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useOverlay().create(WardenConfirmModal);

  async function ask(title: string, description: string, destructive = false): Promise<boolean> {
    const result: unknown = await confirm.open({
      title,
      description,
      confirmLabel: t('wardenAdmin.player.confirm'),
      cancelLabel: t('wardenAdmin.player.cancel'),
      destructive,
    }).result;
    return result === true;
  }

  async function refresh() {
    await refreshNuxtData([`warden-admin-player-${userId}`, `admin-person-${userId}`]);
  }

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
    } catch (failure) {
      const problem = failure instanceof WardenError ? failure.problem : 'failed';
      const known = ['notFound', 'notBanned', 'notLinked', 'alreadyDismissed', 'invalidEnd'];
      toast.add({
        title: t(`wardenAdmin.errors.${known.includes(problem) ? problem : 'failed'}`),
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    }
    await refresh();
  }

  return { ask, run, refresh };
}
