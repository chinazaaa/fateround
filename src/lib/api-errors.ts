/**
 * Turn an unexpected internal/DB failure into a client-safe message.
 *
 * Raw Supabase/Postgres errors can leak schema details — table names, foreign-key
 * constraints, SQL — to anyone hitting the API (e.g. a player saw a
 * `..._describer_player_id_fkey` violation). Log the real error server-side and
 * hand the caller a generic line instead.
 *
 * Use this only for *unexpected* failures. Intentional, user-facing validation
 * messages ("Clue is empty", "It's not your team's turn") are safe and should be
 * returned as-is.
 *
 * `fallback` overrides the generic line when a more specific (but still safe)
 * message fits — e.g. "Failed to fetch from Klipy" for an upstream call.
 */
export function internalErrorMessage(
  context: string,
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  console.error(`[${context}]`, error)
  return fallback
}

/**
 * Structured form of {@link internalErrorMessage} for engine functions whose
 * result a route turns into an HTTP status. `internal: true` flags an unexpected
 * failure the route should serialize as 5xx, distinct from a validation error
 * (returned as a plain `{ error }` string) which stays 4xx.
 */
export function internalFailure(context: string, error: unknown, fallback?: string): { error: string; internal: true } {
  return { error: internalErrorMessage(context, error, fallback), internal: true }
}
