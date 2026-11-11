import { PARTNER_EVENT_PROBLEMS } from '#shared/schemas/partner-events';
import type {
  PartnerAdminView,
  PartnerEventProblem,
  PartnerEventSettingsBody,
  PartnerGameKey,
  PartnerGameSettingsBody,
  PartnerTeamReferentBody,
} from '#shared/schemas/partner-events';
import type { PushImpactView } from '#shared/schemas/push';

// The Partner events section of the admin area. Writes throw a PartnerEventError.

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
    throw new PartnerEventError(
      PARTNER_EVENT_PROBLEMS.includes(problem as PartnerEventProblem)
        ? (problem as PartnerEventProblem)
        : 'failed',
    );
  }
}

/** The event with its personal data: lists, referents and settings. */
export function useAdminPartnerEvent(slug: string) {
  return useFetch<PartnerAdminView>(`/api/admin/partner-events/${slug}`, {
    key: `partner-event-admin-${slug}`,
  });
}

/** What events managers can do to a partner event. Each throws a PartnerEventError when refused. */
export const partnerEventAdminActions = {
  settings: (slug: string, body: PartnerEventSettingsBody) =>
    call(() => $fetch(`/api/admin/partner-events/${slug}`, { method: 'PATCH', body })),
  game: (slug: string, game: PartnerGameKey, body: PartnerGameSettingsBody) =>
    call(() =>
      $fetch(`/api/admin/partner-events/${slug}/games/${game}`, { method: 'PATCH', body }),
    ),
  teamReferent: (slug: string, teamId: string, body: PartnerTeamReferentBody) =>
    call(() =>
      $fetch(`/api/admin/partner-events/${slug}/teams/${teamId}`, { method: 'PATCH', body }),
    ),
  disband: (slug: string, teamId: string) =>
    call(() => $fetch(`/api/admin/partner-events/${slug}/teams/${teamId}`, { method: 'DELETE' })),
  close: (slug: string) =>
    call(() => $fetch(`/api/admin/partner-events/${slug}/close`, { method: 'POST' })),
  reopen: (slug: string) =>
    call(() => $fetch(`/api/admin/partner-events/${slug}/reopen`, { method: 'POST' })),
  announceImpact: (slug: string, locale: 'en' | 'fr') =>
    call(() =>
      $fetch<PushImpactView>(`/api/admin/partner-events/${slug}/announce-impact`, {
        method: 'POST',
        body: { locale },
      }),
    ),
  announce: (slug: string) =>
    call(() =>
      $fetch<{ recipients: number; sendAt: string }>(`/api/admin/partner-events/${slug}/announce`, {
        method: 'POST',
      }),
    ),
};
