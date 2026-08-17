import type { UnoPlayerHand, WhotPlayerHand } from '@/types'

/** Games whose per-player hand table is read through a redaction route (`/api/<game>/hands`). */
export type HandsGame = 'whot' | 'uno'

/**
 * Fetch hands through the server route instead of reading the table.
 *
 * The route returns the caller's own hand in full and every other hand as `card_count` only —
 * see lib/hand-redaction.ts for why the count has to survive redaction. POST so the resume
 * token travels in the body rather than a query string.
 *
 * Returns null on any failure, which callers treat as "poll didn't succeed" and retry, rather
 * than as "the hands are empty" — an empty hand is meaningful state in these games.
 *
 * One function for every game (rather than a copy per game) so the failure semantics above, and
 * fixes to them, can only ever exist once — Crazy Eights and Bingo join by passing their name.
 */
export async function fetchHands<T>(
  game: HandsGame,
  gameCode: string,
  auth: { resumeToken?: string | null; hostToken?: string | null }
): Promise<T[] | null> {
  try {
    const res = await fetch(`/api/${game}/hands`, {
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

/** Whot hands — see {@link fetchHands}. */
export function fetchWhotHands(
  gameCode: string,
  auth: { resumeToken?: string | null; hostToken?: string | null }
): Promise<WhotPlayerHand[] | null> {
  return fetchHands<WhotPlayerHand>('whot', gameCode, auth)
}

/**
 * UNO hands — see {@link fetchHands}.
 *
 * UNO's one difference is Team-Up mode: when it's on, the route also returns the caller's
 * teammate's hand in full (resolved server-side from the resume token), so no extra client
 * argument is needed here.
 */
export function fetchUnoHands(
  gameCode: string,
  auth: { resumeToken?: string | null; hostToken?: string | null }
): Promise<UnoPlayerHand[] | null> {
  return fetchHands<UnoPlayerHand>('uno', gameCode, auth)
}
