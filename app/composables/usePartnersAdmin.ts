import type {
  PartnerAdminView,
  PartnerBody,
  PartnerLogoView,
  PartnerPatchBody,
  PartnerProblem,
  PartnerSettingsBody,
} from '#shared/schemas/partners';
import { PARTNER_PROBLEMS } from '#shared/schemas/partners';

// The Partners section of the admin area. Writes throw a PartnerError with the API's problem.

/** A refused partners request, with the reason the API gave. */
export class PartnerError extends Error {
  constructor(readonly problem: PartnerProblem | 'failed') {
    super(`Partners request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
    throw new PartnerError(
      PARTNER_PROBLEMS.includes(problem as PartnerProblem) ? (problem as PartnerProblem) : 'failed',
    );
  }
}

/** Every partner, hidden ones too, and the contact link. */
export function useAdminPartners() {
  return useFetch<PartnerAdminView>('/api/admin/partners', { key: 'partners-admin' });
}

/** What admins can do to the partners. Each throws a PartnerError when refused. */
export const partnerActions = {
  add: (body: PartnerBody) =>
    call(() => $fetch<{ id: string }>('/api/admin/partners', { method: 'POST', body })),
  update: (id: string, body: PartnerPatchBody) =>
    call(() => $fetch(`/api/admin/partners/${id}`, { method: 'PATCH', body })),
  remove: (id: string) => call(() => $fetch(`/api/admin/partners/${id}`, { method: 'DELETE' })),
  move: (id: string, direction: 'up' | 'down') =>
    call(() => $fetch(`/api/admin/partners/${id}/move`, { method: 'POST', body: { direction } })),
  setSettings: (body: PartnerSettingsBody) =>
    call(() => $fetch('/api/admin/partners/settings', { method: 'PATCH', body })),
  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return call(() =>
      $fetch<PartnerLogoView>('/api/admin/partners/logo', { method: 'POST', body: form }),
    );
  },
};
