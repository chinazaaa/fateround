import type { BingoCard, WhotPlayerHand } from '@/types'

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
 * Fetch a single Bingo card through the server route instead of reading `bingo_cards`.
 *
 * Bingo is not a hand game — each caller reads exactly ONE card, so there is no redaction: the
 * route returns the caller's OWN card in full (via `resumeToken`) or, for the host, one named
 * player's card (`hostToken` + `playerId`). `cells`/`marked_indices` are the secret the anon key
 * must not reach; see src/app/api/bingo/card/route.ts.
 *
 * Returns null on any failure so callers can leave the previous card in place and retry, rather
 * than clearing it — a transport blip must not read as "no card yet". A legitimately absent card
 * (not dealt) also comes back as null, which is the same "leave it and poll" behaviour.
 */
export async function fetchBingoCard(
  gameCode: string,
  auth: { resumeToken?: string | null; hostToken?: string | null; playerId?: string | null }
): Promise<BingoCard | null> {
  try {
    const res = await fetch('/api/bingo/card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameCode: gameCode.toUpperCase(),
        resumeToken: auth.resumeToken ?? undefined,
        hostToken: auth.hostToken ?? undefined,
        playerId: auth.playerId ?? undefined,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { card?: BingoCard | null }
    return data.card ?? null
  } catch {
    return null
  }
}
