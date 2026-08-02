import type { CrazyEightsPlayerHand, WhotPlayerHand } from '@/types'

/**
 * Fetch hands through the server route instead of reading the table.
 *
 * The route returns the caller's own hand in full and every other hand as `card_count` only —
 * see lib/hand-redaction.ts for why the count has to survive redaction. POST so the resume
 * token travels in the body rather than a query string.
 *
 * Returns null on any failure, which callers treat as "poll didn't succeed" and retry, rather
 * than as "the hands are empty" — an empty hand is meaningful state in these games.
 */
export async function fetchWhotHands(
  gameCode: string,
  auth: { resumeToken?: string | null; hostToken?: string | null }
): Promise<WhotPlayerHand[] | null> {
  try {
    const res = await fetch('/api/whot/hands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameCode: gameCode.toUpperCase(),
        resumeToken: auth.resumeToken ?? undefined,
        hostToken: auth.hostToken ?? undefined,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { hands?: WhotPlayerHand[] }
    return data.hands ?? []
  } catch {
    return null
  }
}

/**
 * Crazy Eights equivalent of {@link fetchWhotHands}. Same contract: own hand in full, every
 * other hand as `card_count` only (see lib/hand-redaction.ts); POST so the resume token stays
 * out of the query string; returns null on any failure so callers retry rather than treat the
 * hands as empty.
 */
export async function fetchCrazyEightsHands(
  gameCode: string,
  auth: { resumeToken?: string | null; hostToken?: string | null }
): Promise<CrazyEightsPlayerHand[] | null> {
  try {
    const res = await fetch('/api/crazy-eights/hands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameCode: gameCode.toUpperCase(),
        resumeToken: auth.resumeToken ?? undefined,
        hostToken: auth.hostToken ?? undefined,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { hands?: CrazyEightsPlayerHand[] }
    return data.hands ?? []
  } catch {
    return null
  }
}
