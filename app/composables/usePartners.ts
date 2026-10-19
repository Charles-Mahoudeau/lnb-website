import type { PartnerPublicView } from '#shared/schemas/partners';

// The partners page (/partners). The admin side is in usePartnersAdmin.

/** The visible partners grouped by kind, and the contact link when it's on. */
export function usePublicPartners() {
  return useFetch<PartnerPublicView>('/api/partners', { key: 'partners' });
}
