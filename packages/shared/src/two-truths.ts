import type { Player, Round, TtlGuess, TtlGuessResult, TtlMetadata, TtlStatement } from './types'

export const TTL_MIN_PLAYERS = 3
export const TTL_MAX_PLAYERS = 40
export const TTL_DEFAULT_MAX_PLAYERS = 20
export const TTL_DEFAULT_TIMER = 45
export const TTL_TIMER_OPTIONS = [10, 15, 30, 45, 60, 90] as const
export const TTL_REVEAL_SECONDS = 5
export const TTL_GUESS_POINTS = 100
export const TTL_FOOL_POINTS = 50
export const TTL_MAX_STATEMENT_LENGTH = 200

/**
 * Parse a round's client-readable metadata.
 *
 * `lie_index` is ABSENT while the round is unrevealed — it lives in the service-role-only
 * `ttl_round_lies` table until the server folds it back in at the moment the round is marked
 * finished. A missing lie is normal, not invalid metadata, so it must not blank the board
 * mid-round: it comes back as `lie_index: null`. When present it is still validated as 0..2.
 */
export function parseTtlMetadata(raw: unknown): TtlMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (!Array.isArray(m.statements)) return null
  const statements = m.statements.filter((s): s is string => typeof s === 'string')
  if (statements.length !== 3) return null
  let lie_index: number | null = null
  if (m.lie_index !== undefined && m.lie_index !== null) {
    if (typeof m.lie_index !== 'number') return null
    if (m.lie_index < 0 || m.lie_index > 2) return null
    lie_index = m.lie_index
  }
  return { statements: statements as [string, string, string], lie_index }
}

/**
 * Parse the results the server folded into a round's metadata when it revealed the round.
 *
 * Mid-round this key is ABSENT — `ttl_guesses.guessed_index / is_correct / points` are revoked
 * from the anon role precisely so nobody can read the lie off another player's guess before
 * answering. Returns [] for a revealed round nobody guessed on, and null when the round has no
 * results at all (unrevealed, or not a Two Truths round); those are different states and
 * callers must not conflate them.
 */
export function parseTtlGuessResults(raw: unknown): TtlGuessResult[] | null {
  if (!raw || typeof raw !== 'object') return null
  const list = (raw as Record<string, unknown>).guesses
  if (!Array.isArray(list)) return null
  const results: TtlGuessResult[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const g = item as Record<string, unknown>
    if (typeof g.id !== 'string' || typeof g.player_id !== 'string') continue
    if (typeof g.guessed_index !== 'number' || typeof g.is_correct !== 'boolean') continue
    if (typeof g.points !== 'number') continue
    results.push({
      id: g.id,
      player_id: g.player_id,
      guessed_index: g.guessed_index,
      is_correct: g.is_correct,
      points: g.points,
    })
  }
  return results
}

/** Every guess from rounds the server has already revealed, rebuilt as full guess rows. */
export function revealedTtlGuesses(rounds: Round[]): TtlGuess[] {
  const guesses: TtlGuess[] = []
  for (const round of rounds) {
    const results = parseTtlGuessResults(round.ttl_metadata)
    if (!results) continue
    for (const r of results) {
      guesses.push({
        id: r.id,
        game_id: round.game_id,
        round_id: round.id,
        player_id: r.player_id,
        guessed_index: r.guessed_index,
        is_correct: r.is_correct,
        points: r.points,
      })
    }
  }
  return guesses
}

/**
 * Every guess this client is ALLOWED to see: the revealed rounds' folded results, plus the
 * caller's own rows (served by POST /api/two-truths/my-guesses).
 *
 * This is what feeds scoring and the reveal UI. Other players' in-flight guesses are absent by
 * construction — they are the leak this path exists to close. Never substitute the anon
 * `ttl_guesses` progress rows here: they carry no points and would tally as NaN.
 */
export function visibleTtlGuesses(rounds: Round[], ownGuesses: TtlGuess[]): TtlGuess[] {
  const byId = new Map<string, TtlGuess>()
  for (const g of revealedTtlGuesses(rounds)) byId.set(g.id, g)
  for (const g of ownGuesses) if (!byId.has(g.id)) byId.set(g.id, g)
  return [...byId.values()]
}

export function revealCountdownSeconds(endedAt: string | null | undefined, revealSeconds = TTL_REVEAL_SECONDS): number {
  if (!endedAt) return revealSeconds
  const deadline = new Date(endedAt).getTime() + revealSeconds * 1000
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

export function formatTtlChoiceLabel(index: number): string {
  return String.fromCharCode(65 + index)
}

export interface TtlPlayerScore {
  id: string
  name: string
  score: number
  correctGuesses: number
  fooledCount: number
}

export function tallyTtlScores(guesses: TtlGuess[], players: Player[], rounds: Round[]): TtlPlayerScore[] {
  const activePlayers = players.filter((p) => p.spectator !== true)
  const totals = new Map<string, { score: number; correct: number; fooled: number }>()
  for (const p of activePlayers) {
    totals.set(p.id, { score: 0, correct: 0, fooled: 0 })
  }

  for (const g of guesses) {
    const row = totals.get(g.player_id)
    if (!row) continue
    row.score += g.points
    if (g.is_correct) row.correct += 1
  }

  for (const round of rounds) {
    const submitterId = round.submitter_player_id
    if (!submitterId) continue
    const roundGuesses = guesses.filter((g) => g.round_id === round.id)
    const fooled = roundGuesses.filter((g) => !g.is_correct).length
    const row = totals.get(submitterId)
    if (row) {
      row.fooled += fooled
      row.score += fooled * TTL_FOOL_POINTS
    }
  }

  return activePlayers
    .map((p) => {
      const row = totals.get(p.id) ?? { score: 0, correct: 0, fooled: 0 }
      return {
        id: p.id,
        name: p.name,
        score: row.score,
        correctGuesses: row.correct,
        fooledCount: row.fooled,
      }
    })
    .sort((a, b) => b.score - a.score || b.correctGuesses - a.correctGuesses || a.name.localeCompare(b.name))
}

export function playerDisplayName(playerId: string | null | undefined, players: Player[]): string {
  if (!playerId) return 'Someone'
  return players.find((p) => p.id === playerId)?.name ?? 'Someone'
}

/**
 * Is the token-gated own-statement still current for the roster row it belongs to?
 *
 * The views keep two copies of the caller's submission: the roster row from the bulk
 * `ttl_statements` read (no `lie_index` — it's revoked from anon) and the full row from
 * POST /api/two-truths/my-statement. The full row is preferred, but only while it is FRESH.
 *
 * Matching on `id` alone is not enough: re-submitting UPSERTs the same row, so an edit keeps
 * the id and only bumps `updated_at`. Without the timestamp check, reopening "edit" right
 * after a re-submit prefills the PREVIOUS lie. Falling back to the roster row instead shows
 * no lie selected — which is correct: unknown must not render as a stale answer.
 *
 * Mirrored in src/lib/two-truths.ts: the web app does not depend on @fateround/shared, so the
 * two copies must be kept in step. Mobile imports this one.
 */
export function ownTtlStatementIsFresh(
  own: Pick<TtlStatement, 'id' | 'updated_at'> | null | undefined,
  roster: Pick<TtlStatement, 'id' | 'updated_at'> | null | undefined
): boolean {
  if (!own || !roster || own.id !== roster.id) return false
  const ownAt = Date.parse(own.updated_at ?? '')
  const rosterAt = Date.parse(roster.updated_at ?? '')
  // Unparseable timestamps on either side: fall back to the id match rather than discarding a
  // row that is probably fine (the own-row is the only source of the caller's own lie).
  if (Number.isNaN(ownAt) || Number.isNaN(rosterAt)) return true
  return ownAt >= rosterAt
}
