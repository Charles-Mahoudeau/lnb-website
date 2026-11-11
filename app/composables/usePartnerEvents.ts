import { PARTNER_EVENT_PROBLEMS } from '#shared/schemas/partner-events';
import type {
  PartnerEventProblem,
  PartnerEventView,
  PartnerInterestBody,
} from '#shared/schemas/partner-events';

// Partner event pages (/special/<slug>). See docs/partner-events.md.

/** A refused action: `problem` is a code the page turns into a message. */
export class PartnerEventError extends Error {
  constructor(public readonly problem: PartnerEventProblem | 'failed') {
    super(problem);
  }
}

function toPartnerEventError(error: unknown): PartnerEventError {
  const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
  return new PartnerEventError(
    PARTNER_EVENT_PROBLEMS.includes(problem as PartnerEventProblem)
      ? (problem as PartnerEventProblem)
      : 'failed',
  );
}

/** A partner event, with the signed-in student's own interest in `mine`. */
export function usePartnerEvent(slug: string) {
  return useFetch<PartnerEventView>(`/api/partner-events/${slug}`, {
    key: `partner-event-${slug}`,
  });
}

/** Replaces the student's interest in the event's games. Throws a PartnerEventError. */
export async function savePartnerInterest(
  slug: string,
  body: PartnerInterestBody,
): Promise<PartnerEventView> {
  try {
    return await $fetch<PartnerEventView>(`/api/partner-events/${slug}/interest`, {
      method: 'PUT',
      body,
    });
  } catch (error) {
    throw toPartnerEventError(error);
  }
}
