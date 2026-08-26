import type { BingoCard, CrazyEightsPlayerHand, GoFishPlayerHand, WhotPlayerHand } from '@/types'

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

/**
 * Outcome of a Bingo card fetch. Three states the callers MUST keep apart:
 *
 *   - `{ ok: true, card }`      — the server answered. `card: null` means "no card dealt yet",
 *                                 which is real game state, not a failure.
 *   - `{ ok: false, unauthorized: true }`  — this caller may not read a card here (missing or
 *                                 rejected resume token). Retrying cannot help; say so.
 *   - `{ ok: false, unauthorized: false }` — transport/server blip. Keep the previous card, retry.
 */
export type BingoCardResult = { ok: true; card: BingoCard | null } | { ok: false; unauthorized: boolean }

/**
 * Fetch the caller's OWN Bingo card through the server route instead of reading `bingo_cards`.
 *
 * Bingo is not a hand game — each caller reads exactly ONE card, their own, so there is no
 * redaction: the route resolves the player from the SECRET `resumeToken` and returns that
 * player's card. There is no host/`playerId` variant; see src/app/api/bingo/card/route.ts for
 * why. `cells`/`marked_indices` are the secret the anon key must not reach.
 *
 * A missing token is reported as `unauthorized` WITHOUT a request, so the caller surfaces the
 * same "session expired" message `markCell` does rather than rendering an empty grid forever.
 */
export async function fetchBingoCard(
  gameCode: string,
  auth: { resumeToken?: string | null }
): Promise<BingoCardResult> {
  if (!auth.resumeToken) return { ok: false, unauthorized: true }
  try {
    const res = await fetch('/api/bingo/card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameCode: gameCode.toUpperCase(),
        resumeToken: auth.resumeToken,
      }),
    })
    if (!res.ok) return { ok: false, unauthorized: res.status === 401 || res.status === 403 }
    const data = (await res.json()) as { card?: BingoCard | null }
    return { ok: true, card: data.card ?? null }
  } catch {
    return { ok: false, unauthorized: false }
  }
}
