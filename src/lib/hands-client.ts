import type { UnoPlayerHand, WhotPlayerHand } from '@/types'

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
 * Fetch UNO hands through the server route instead of reading the table.
 *
 * Mirrors fetchWhotHands: the caller's own hand comes back in full, every other hand as
 * `card_count` only. UNO's one difference is Team-Up mode — when it's on, the route also returns
 * the caller's teammate's hand in full (resolved server-side from the resume token), so no extra
 * client argument is needed here.
 *
 * Returns null on any failure, which callers treat as "poll didn't succeed" and retry, rather
 * than as "the hands are empty" — an empty hand is meaningful state in these games.
 */
export async function fetchUnoHands(
  gameCode: string,
  auth: { resumeToken?: string | null; hostToken?: string | null }
): Promise<UnoPlayerHand[] | null> {
  try {
    const res = await fetch('/api/uno/hands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameCode: gameCode.toUpperCase(),
        resumeToken: auth.resumeToken ?? undefined,
        hostToken: auth.hostToken ?? undefined,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { hands?: UnoPlayerHand[] }
    return data.hands ?? []
  } catch {
    return null
  }
}
