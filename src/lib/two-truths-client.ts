import type { TtlGuess, TtlStatement } from '@/types'

/**
 * Fetch the caller's OWN Two Truths submission through the server route.
 *
 * `ttl_statements.lie_index` is revoked from the anon role (reading the table gave away every
 * player's lie), so the bulk table read used for the roster comes back without it. This route
 * returns the caller's own row in full, gated on their secret resume token — POST so the token
 * travels in the body rather than a query string. Sibling of lib/hands-client.ts.
 *
 * Returns null on any failure, which callers treat as "not loaded yet" and retry, rather than
 * as "you have not submitted" — the two are very different states in the lobby.
 */
export async function fetchMyTtlStatement(gameCode: string, resumeToken: string | null): Promise<TtlStatement | null> {
  if (!resumeToken) return null
  try {
    const res = await fetch('/api/two-truths/my-statement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode: gameCode.toUpperCase(), resumeToken }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { statement?: TtlStatement | null }
    return data.statement ?? null
  } catch {
    return null
  }
}

/**
 * Fetch the caller's OWN Two Truths guesses through the server route.
 *
 * `ttl_guesses.guessed_index / is_correct / points` are revoked from the anon role (a round
 * only ends once everyone has guessed, so those columns handed the lie to whoever had not
 * answered yet). The bulk table read is progress only; this route returns the caller's own
 * rows in full, gated on their secret resume token.
 *
 * Returns null on any failure — "not loaded yet", NOT "you have not guessed". Callers must
 * keep using the anon progress rows to decide whether a guess is locked in, so a failed fetch
 * can never reopen the choices.
 */
export async function fetchMyTtlGuesses(gameCode: string, resumeToken: string | null): Promise<TtlGuess[] | null> {
  if (!resumeToken) return null
  try {
    const res = await fetch('/api/two-truths/my-guesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode: gameCode.toUpperCase(), resumeToken }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { guesses?: TtlGuess[] }
    return data.guesses ?? null
  } catch {
    return null
  }
}
