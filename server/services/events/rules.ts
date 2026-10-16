// Event rules with no database and no Nuxt imports, so unit tests can load them.

/** A date moved by the same amount as an event's start, or null for null. */
export function shiftDate(date: Date | null, from: Date, to: Date): Date | null {
  return date ? new Date(date.getTime() + (to.getTime() - from.getTime())) : null;
}
