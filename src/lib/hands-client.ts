import type { GoFishPlayerHand, WhotPlayerHand } from '@/types'

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

export async function fetchGoFishHands(
  gameCode: string,
  auth: { resumeToken?: string | null; hostToken?: string | null }
): Promise<GoFishPlayerHand[] | null> {
  try {
    const res = await fetch('/api/gofish/hands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameCode: gameCode.toUpperCase(),
        resumeToken: auth.resumeToken ?? undefined,
        hostToken: auth.hostToken ?? undefined,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { hands?: GoFishPlayerHand[] }
    return data.hands ?? []
  } catch {
    return null
  }
}
