import { mahjongTileBase, mahjongTileShortLabel } from '@fateround/shared/mahjong'

/**
 * Meld-claim options (pung / kong / chow) for a discarded tile, ported from web
 * `src/lib/mahjong-claims.ts`. The "mahjong" (win) claim is handled separately
 * by the player view's own button; the server re-validates every claim.
 */
export type MeldClaim = { type: 'pung' | 'kong' | 'chow'; tiles: string[]; label: string }

function countsForBase(tiles: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const tile of tiles) {
    const base = mahjongTileBase(tile)
    counts.set(base, (counts.get(base) ?? 0) + 1)
  }
  return counts
}

function isSuited(base: string): boolean {
  return /^[mps][1-9]$/.test(base)
}

function possibleChowCombos(hand: string[], discardTile: string): string[][] {
  const base = mahjongTileBase(discardTile)
  if (!isSuited(base)) return []
  const suit = base[0]
  const n = Number(base.slice(1))
  const counts = countsForBase(hand)
  return (
    [
      [n - 2, n - 1],
      [n - 1, n + 1],
      [n + 1, n + 2],
    ] as const
  )
    .filter(([a, b]) => a >= 1 && b <= 9)
    .map(([a, b]) => [`${suit}${a}`, `${suit}${b}`])
    .filter(([a, b]) => (counts.get(a) ?? 0) > 0 && (counts.get(b) ?? 0) > 0)
}

/**
 * @param isNextPlayer whether this player is the seat immediately after the
 *   discarder (only they may chow).
 */
export function mahjongMeldClaims(
  hand: string[],
  discardTile: string,
  isNextPlayer: boolean
): MeldClaim[] {
  const base = mahjongTileBase(discardTile)
  const counts = countsForBase(hand)
  const count = counts.get(base) ?? 0
  const options: MeldClaim[] = []

  if (count >= 3) options.push({ type: 'kong', tiles: [base, base, base], label: 'Kong' })
  if (count >= 2) options.push({ type: 'pung', tiles: [base, base], label: 'Pung' })
  if (isNextPlayer) {
    for (const chow of possibleChowCombos(hand, discardTile)) {
      options.push({
        type: 'chow',
        tiles: chow,
        label: `Chow ${chow.map((t) => mahjongTileShortLabel(t)).join(' ')}`,
      })
    }
  }
  return options
}

/** Seat immediately after the discarder — the only one allowed to chow. */
export function isSeatAfterDiscarder(
  turnOrder: string[],
  discarderId: string | undefined,
  playerId: string | null
): boolean {
  if (!discarderId || !playerId) return false
  const idx = turnOrder.indexOf(discarderId)
  if (idx < 0) return false
  return turnOrder[(idx + 1) % turnOrder.length] === playerId
}
