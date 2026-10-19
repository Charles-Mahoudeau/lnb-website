import { EventsAdminPushConfirmModal } from '#components';

import type { PushImpactBody, PushImpactView } from '#shared/schemas/push';

// Asks the manager before an action that sends notifications, with the real numbers.

/** The impact request without its language, which the composable fills in. */
export type PushImpactAction = PushImpactBody extends infer T
  ? T extends unknown
    ? Omit<T, 'locale'>
    : never
  : never;

export interface PushConfirmOptions {
  eventId: string;
  /** What the action would send. Its locale is filled in from the page. */
  action: PushImpactAction;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  /** Carry on without a dialog when nobody would be notified, such as saving a small edit. */
  skipIfNobody?: boolean;
}

export function useEventPush() {
  const { locale } = useI18n();
  const overlay = useOverlay();
  const modal = overlay.create(EventsAdminPushConfirmModal);

  /** What the action would send, or null if it couldn't be counted. */
  async function impact(eventId: string, action: PushImpactAction) {
    const lang = locale.value.startsWith('fr') ? 'fr' : 'en';
    try {
      return await eventActions.pushImpact(eventId, { ...action, locale: lang });
    } catch {
      return null;
    }
  }

  /** Resolves true when the manager goes ahead, false when they back out. */
  async function confirmPush(options: PushConfirmOptions): Promise<boolean> {
    const counted: PushImpactView | null = await impact(options.eventId, options.action);
    if (options.skipIfNobody && counted && counted.recipients === 0) return true;
    const confirmed: unknown = await modal.open({
      title: options.title,
      description: options.description,
      confirmLabel: options.confirmLabel,
      cancelLabel: options.cancelLabel,
      destructive: options.destructive,
      impact: counted,
    }).result;
    return confirmed === true;
  }

  return { impact, confirmPush };
}
