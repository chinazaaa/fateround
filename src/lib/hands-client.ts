import type { CrazyEightsPlayerHand, GoFishPlayerHand, WhotPlayerHand } from '@/types'

type HandsAuth = { resumeToken?: string | null; hostToken?: string | null }

/**
 * Fetch hands through the server route instead of reading the table.
 *
 * The route returns the caller's own hand in full and every other hand as `card_count` only —
 * see lib/hand-redaction.ts for why the count has to survive redaction. POST so the resume
 * token travels in the body rather than a query string (access logs, CDN logs, history).
 *
 * Returns null on any failure, which callers treat as "poll didn't succeed" and retry, rather
 * than as "the hands are empty" — an empty hand is meaningful state in these games.
 *
 * One implementation for every card game: the per-game wrappers below differ only in the URL
 * and the row type, and a divergence between them is how half a redaction ships.
 */
async function fetchHands<T>(endpoint: string, gameCode: string, auth: HandsAuth): Promise<T[] | null> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameCode: gameCode.toUpperCase(),
        resumeToken: auth.resumeToken ?? undefined,
        hostToken: auth.hostToken ?? undefined,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { hands?: T[] }
    return data.hands ?? []
  } catch {
    return null
  }
}

/** Whot hands — see {@link fetchHands} for the contract. */
export function fetchWhotHands(gameCode: string, auth: HandsAuth): Promise<WhotPlayerHand[] | null> {
  return fetchHands<WhotPlayerHand>('/api/whot/hands', gameCode, auth)
}

/** Crazy Eights hands — see {@link fetchHands} for the contract. */
export function fetchCrazyEightsHands(gameCode: string, auth: HandsAuth): Promise<CrazyEightsPlayerHand[] | null> {
  return fetchHands<CrazyEightsPlayerHand>('/api/crazy-eights/hands', gameCode, auth)
}

/** Go Fish hands — see {@link fetchHands} for the contract. */
export function fetchGoFishHands(gameCode: string, auth: HandsAuth): Promise<GoFishPlayerHand[] | null> {
  return fetchHands<GoFishPlayerHand>('/api/gofish/hands', gameCode, auth)
}
