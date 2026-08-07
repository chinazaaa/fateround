import type { TtlStatement } from '@/types'

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
