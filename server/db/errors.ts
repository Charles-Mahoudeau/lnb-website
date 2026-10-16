/** Whether an error is PostgreSQL's unique violation, wrapped by Drizzle or not. */
export function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (e as { code?: string } | undefined)?.code;
  return code(error) === '23505' || code((error as { cause?: unknown }).cause) === '23505';
}
