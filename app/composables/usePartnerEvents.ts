import { PARTNER_EVENT_PROBLEMS } from '#shared/schemas/partner-events';
import type {
  PartnerEventProblem,
  PartnerEventView,
  PartnerGameKey,
  PartnerGameTeamsView,
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

/** A game's teams and the students looking for one (names are for signed-in students). */
export function usePartnerTeams(slug: string, game: MaybeRefOrGetter<PartnerGameKey>) {
  return useFetch<PartnerGameTeamsView>(
    () => `/api/partner-events/${slug}/games/${toValue(game)}`,
    {
      key: computed(() => `partner-teams-${slug}-${toValue(game)}`),
    },
  );
}

/**
 * Calls a team route of one game: `path` is what follows `/games/<game>` (for example
 * `/teams/<id>/leave`). Throws a PartnerEventError.
 */
export async function partnerTeamCall(
  slug: string,
  game: PartnerGameKey,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<void> {
  try {
    await $fetch(`/api/partner-events/${slug}/games/${game}${path}`, { method, body });
  } catch (error) {
    throw toPartnerEventError(error);
  }
}
