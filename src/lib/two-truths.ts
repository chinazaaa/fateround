import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'
import type { Player, Round, TtlGuess, TtlMetadata, TtlStatement } from '@/types'

export type TtlHostMode = 'spectator' | 'player'

function ttlHostModeKey(gameCode: string) {
  return `ttl-host-mode-${gameCode}`
}

export function getTtlHostMode(gameCode: string): TtlHostMode {
  if (typeof window === 'undefined') return 'player'
  return localStorage.getItem(ttlHostModeKey(gameCode)) === 'spectator' ? 'spectator' : 'player'
}

export function setTtlHostMode(gameCode: string, mode: TtlHostMode) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ttlHostModeKey(gameCode), mode)
}

export const TTL_MIN_PLAYERS = 3
export const TTL_MAX_PLAYERS = 40
export const TTL_DEFAULT_MAX_PLAYERS = 20
export const TTL_DEFAULT_TIMER = 45
export const TTL_TIMER_OPTIONS = [10, 15, 30, 45, 60, 90] as const
export const TTL_REVEAL_SECONDS = 5
export const TTL_GUESS_POINTS = 100
export const TTL_FOOL_POINTS = 50
export const TTL_MAX_STATEMENT_LENGTH = 200

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function clampTtlMaxPlayers(n: number): number {
  return Math.min(Math.max(Math.floor(n), TTL_MIN_PLAYERS), TTL_MAX_PLAYERS)
}

export function clampTtlTimer(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (TTL_TIMER_OPTIONS as readonly number[]).includes(n) ? n : TTL_DEFAULT_TIMER
}

/**
 * Parse a round's client-readable metadata.
 *
 * `lie_index` is ABSENT while the round is unrevealed — it lives in the service-role-only
 * `ttl_round_lies` table until the server folds it back in at the moment the round is marked
 * finished (see two-truths-advance.ts). A missing lie is therefore normal, not invalid, and
 * must not blank the board mid-round: it comes back as `lie_index: null`. When present it is
 * still validated as 0..2.
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
 * Shuffle a submitter's three statements for display.
 *
 * The shuffled lie index is returned SEPARATELY from the metadata so the caller can store it
 * in `ttl_round_lies` rather than in `rounds.ttl_metadata` — the metadata is anon-readable
 * (it's in ROUND_SELECT), so anything placed there is public the moment the round row exists.
 */
export function buildTtlMetadata(
  stmt: Pick<TtlStatement, 'statement_a' | 'statement_b' | 'statement_c' | 'lie_index'>
): { metadata: TtlMetadata; lieIndex: number } {
  if (stmt.lie_index == null) throw new Error('Missing lie index for player')
  const original: [string, string, string] = [stmt.statement_a, stmt.statement_b, stmt.statement_c]
  const order = shuffle([0, 1, 2] as const)
  const statements = order.map((i) => original[i]) as [string, string, string]
  const lieIndex = order.indexOf(stmt.lie_index as 0 | 1 | 2)
  return { metadata: { statements, lie_index: null }, lieIndex }
}

export function shufflePlayerOrder(playerIds: string[]): string[] {
  return shuffle([...playerIds])
}

/** One round's hidden answer, keyed by round_number so the caller can match it to the row
 *  ids returned by the `rounds` insert. */
export type TtlRoundLie = { round_number: number; lie_index: number }

/**
 * Build every round row for a Two Truths session, plus the hidden lie for each.
 *
 * The rows carry ONLY `{ statements }` in `ttl_metadata`. Every round is created up front
 * (one per submitter), so a lie stored in the round row would be readable with the anon key
 * for all rounds — including the one being guessed — from the moment the game starts. The
 * caller must write `lies` into `ttl_round_lies`, which anon cannot read.
 */
export function buildTtlRoundRows(opts: {
  gameId: string
  statements: TtlStatement[]
  playerOrder: string[]
  now: string
}): { rows: Omit<Round, 'id'>[]; lies: TtlRoundLie[] } {
  const byPlayer = new Map(opts.statements.map((s) => [s.player_id, s]))
  const rows: Omit<Round, 'id'>[] = []
  const lies: TtlRoundLie[] = []
  opts.playerOrder.forEach((playerId, index) => {
    const stmt = byPlayer.get(playerId)
    if (!stmt) throw new Error('Missing statements for player')
    const { metadata, lieIndex } = buildTtlMetadata(stmt)
    const roundNumber = index + 1
    rows.push({
      game_id: opts.gameId,
      round_number: roundNumber,
      participant_ids: [],
      wyr_option_a: null,
      wyr_option_b: null,
      mlt_question: null,
      submitter_player_id: playerId,
      quote_text: null,
      quote_author_participant_id: null,
      quote_submitted_at: null,
      status: index === 0 ? 'active' : 'pending',
      started_at: index === 0 ? opts.now : null,
      ended_at: null,
      ttl_metadata: metadata,
    })
    lies.push({ round_number: roundNumber, lie_index: lieIndex })
  })
  return { rows, lies }
}

export function lobbyReadyForTwoTruths(
  playerIds: string[],
  statements: TtlStatement[]
): { ok: boolean; error?: string } {
  if (playerIds.length < TTL_MIN_PLAYERS) {
    return { ok: false, error: `Need at least ${TTL_MIN_PLAYERS} players to start` }
  }
  const submitted = new Set(statements.map((s) => s.player_id))
  const submittedCount = playerIds.filter((id) => submitted.has(id)).length
  if (submittedCount < TTL_MIN_PLAYERS) {
    return { ok: false, error: `Need at least ${TTL_MIN_PLAYERS} players to submit their statements` }
  }
  return { ok: true }
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

export async function clearTwoTruthsSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['ttl_guesses', 'ttl_statements'], { resetSpectators: true })
}
