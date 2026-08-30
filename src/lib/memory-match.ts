import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import {
  MATCHING_PAIRS_MIN_PLAYERS,
  MATCHING_PAIRS_MAX_PLAYERS,
  MATCHING_PAIRS_DEFAULT_MAX_PLAYERS,
} from '@/lib/player-limits'
export { MATCHING_PAIRS_MIN_PLAYERS, MATCHING_PAIRS_MAX_PLAYERS, MATCHING_PAIRS_DEFAULT_MAX_PLAYERS }

// ── Constants ─────────────────────────────────────────────────────────────────

/** Grid size options: number of *pairs* (not total cards). */
export const MATCHING_PAIRS_GRID_SIZES = [8, 16] as const
export type MatchingPairsGridSize = (typeof MATCHING_PAIRS_GRID_SIZES)[number]
export const MATCHING_PAIRS_DEFAULT_GRID_SIZE: MatchingPairsGridSize = 8

/** Delay (ms) before a non-matching pair flips back face-down. */
export const MATCHING_PAIRS_FLIP_BACK_MS = 800

/** Points awarded per correctly matched pair. */
export const MATCHING_PAIRS_POINTS_PER_PAIR = 1000

/** Flat bonus awarded every time a player's consecutive-match streak hits a multiple of 3. */
export const MATCHING_PAIRS_STREAK_BONUS = 500

/** Placement bonuses by finish rank (1-indexed). Index 0 is unused. */
export const MATCHING_PAIRS_PLACEMENT_BONUS = [0, 1500, 1000, 500] as const // [unused, 1st, 2nd, 3rd]

/** Flat bonus for zero wrong attempts on a completed board. */
export const MATCHING_PAIRS_PERFECT_GAME_BONUS = 2000

/** Points deducted for each wrong (mismatched) flip attempt. */
export const MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY = 100

/** Multiplier applied to placement bonus when the player has zero wrong attempts (clean streak). */
export const MATCHING_PAIRS_CLEAN_STREAK_MULTIPLIER = 2

/** Bonus for finishing under the speed par (if set by host), in points per full minute under par. */
export const MATCHING_PAIRS_SPEED_PAR_BONUS_PER_MINUTE = 200

export const MATCHING_PAIRS_GAME_DURATION_OPTIONS = [0, 30, 45, 60, 120, 180, 300, 600] as const

export function formatMatchingPairsGameDuration(seconds: number): string {
  if (!seconds) return 'No limit'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

export function matchingPairsGameSessionExpired(
  sessionStartedAt: string | null | undefined,
  timerSeconds: number | null | undefined
): boolean {
  if (!timerSeconds || timerSeconds <= 0) return false
  if (!sessionStartedAt) return false
  return Date.now() - new Date(sessionStartedAt).getTime() >= timerSeconds * 1000
}

// ── Icon pool (80 distinct emoji/symbol strings) ─────────────────────────────
// Spec: "80 curated icons spanning varied categories — fruits, shapes, everyday
// objects. No icon library installed; use Unicode emoji/symbols."
// All items are visually distinct at a glance.

export const MEMORY_MATCH_ICON_POOL: readonly string[] = [
  // Fruits & food (20)
  '🍎',
  '🍊',
  '🍋',
  '🍇',
  '🍓',
  '🍒',
  '🍑',
  '🥝',
  '🍍',
  '🥭',
  '🫐',
  '🍉',
  '🍌',
  '🍈',
  '🍐',
  '🥥',
  '🍅',
  '🥑',
  '🍆',
  '🌽',
  // Animals (20)
  '🐶',
  '🐱',
  '🐭',
  '🐹',
  '🐰',
  '🦊',
  '🐻',
  '🐼',
  '🐨',
  '🐯',
  '🦁',
  '🐸',
  '🐧',
  '🐦',
  '🦜',
  '🐠',
  '🐬',
  '🦋',
  '🐝',
  '🦔',
  // Objects & tools (20)
  '⚽',
  '🏀',
  '🎸',
  '🎺',
  '🎻',
  '🎹',
  '🎯',
  '🎲',
  '🎮',
  '🧲',
  '🔭',
  '🧪',
  '💡',
  '🔑',
  '⏰',
  '☂️',
  '🎈',
  '🪁',
  '🎀',
  '📚',
  // Shapes & symbols (20)
  '⭐',
  '🌙',
  '☀️',
  '🌈',
  '❄️',
  '🔥',
  '💧',
  '🌊',
  '⚡',
  '🌸',
  '🍀',
  '🌴',
  '🌵',
  '🍄',
  '🌺',
  '🏔️',
  '🌋',
  '🏝️',
  '🌍',
  '🪐',
] as const

/** 16 visually distinct colors for pair highlighting (one per pair). */
export const MEMORY_MATCH_PAIR_COLORS: readonly string[] = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#84cc16', // lime
  '#06b6d4', // cyan
  '#a855f7', // purple
  '#f59e0b', // amber
  '#10b981', // emerald
  '#6366f1', // indigo
  '#e11d48', // crimson
] as const

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single card pair entry as stored in round metadata. */
export interface MatchingPairEntry {
  /** Icon string (emoji). Both cards in the pair share this. */
  icon: string
  /** CSS color string. Both cards in the pair share this. */
  color: string
  /** Zero-based pair index within the round's pair set (0..N-1). */
  pairIndex: number
}

/**
 * Per-player shuffled card layout.
 * `cards[i]` is the pair index of the card at position i.
 * Length = gridSizePairs * 2 (total cards).
 */
export interface MatchingPairsPlayerBoard {
  playerId: string
  /** Card order: each value is a pairIndex (0-based). Appears twice per value. */
  cardOrder: number[]
}

/** Stored in rounds.memory_match_metadata. */
export interface MatchingPairsMetadata {
  gridSizePairs: MatchingPairsGridSize
  /** The selected pair set for this round. Index = pairIndex. */
  pairs: MatchingPairEntry[]
  /** Per-player shuffled board layouts (generated at game start). */
  playerBoards: MatchingPairsPlayerBoard[]
  /** Seed used for randomization (for auditability). */
  seed: number
}

/** Row from memory_match_submissions. */
export interface MatchingPairsSubmission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  pair_index: number
  is_match: boolean
  streak_at_time: number
  streak_bonus: number
  points_after: number
  submitted_at: string
}

/** Row from memory_match_progress. */
export interface MatchingPairsProgress {
  id: string
  game_id: string
  round_id: string
  player_id: string
  pairs_matched: number
  wrong_attempts: number
  finished: boolean
  finish_rank: number | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

// ── Score computation ─────────────────────────────────────────────────────────

export interface MatchingPairsPlayerScore {
  playerId: string
  pairsMatched: number
  wrongAttempts: number
  streakBonusTotal: number
  longestStreak: number
  perfectGame: boolean
  placement: number
  placementBonus: number
  wrongPenaltyTotal: number
  cleanStreakMultiplierBonus: number
  speedParBonus: number
  finalScore: number
  timeTakenMs: number | null
}

/**
 * Compute placement bonus by finish rank (1-indexed).
 * Ranks 4+ get 0.
 */
export function matchingPairsPlacementBonus(rank: number): number {
  return MATCHING_PAIRS_PLACEMENT_BONUS[rank] ?? 0
}

/**
 * Compute the full final score for a player from their submission history.
 * `gridSizePairs` is needed to determine perfect-game eligibility.
 */
export function tallyMatchingPairsScore(
  submissions: MatchingPairsSubmission[],
  progress: MatchingPairsProgress,
  gridSizePairs: MatchingPairsGridSize,
  sessionStartedAt?: string | null,
  roundStartedAt?: string | null,
  timerSeconds?: number | null
): MatchingPairsPlayerScore {
  const pairsMatched = submissions.filter((s) => s.is_match).length
  const wrongAttempts = submissions.filter((s) => !s.is_match).length
  const streakBonusTotal = submissions.reduce((acc, s) => acc + s.streak_bonus, 0)

  // Longest streak: walk through submissions in order tracking running streak.
  // Sort submissions chronologically to guarantee correct streak calculation.
  const sortedSubs = [...submissions].sort(
    (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
  )
  let maxStreak = 0
  let streak = 0
  for (const s of sortedSubs) {
    if (s.is_match) {
      streak++
      if (streak > maxStreak) maxStreak = streak
    } else {
      streak = 0
    }
  }

  const perfectGame = progress.finished && wrongAttempts === 0 && pairsMatched === gridSizePairs
  const placement = progress.finish_rank ?? 999
  const placementBonus = matchingPairsPlacementBonus(placement)

  // Wrong attempt penalty
  const wrongPenaltyTotal = wrongAttempts * MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY

  // Clean streak multiplier: if zero wrong attempts on a completed board, double the placement bonus
  const cleanStreakMultiplierBonus =
    progress.finished && wrongAttempts === 0 && pairsMatched === gridSizePairs
      ? placementBonus * (MATCHING_PAIRS_CLEAN_STREAK_MULTIPLIER - 1)
      : 0

  // Speed bonus: awarded per round only if the player matched ALL pairs and
  // finished before the round's time limit. Uses the round's own start time
  // (roundStartedAt) when available, falling back to session_started_at.
  let speedParBonus = 0
  if (progress.finished && progress.finished_at && pairsMatched === gridSizePairs) {
    const timerAnchor = roundStartedAt ?? sessionStartedAt
    if (timerAnchor) {
      const memorizedMs = (gridSizePairs >= 16 ? 5 : 3) * 1000
      const memorizeSeconds = memorizedMs / 1000
      const startMs = new Date(timerAnchor).getTime() + memorizedMs
      const elapsedMs = new Date(progress.finished_at).getTime() - startMs
      const playTimerSeconds = timerSeconds != null ? Math.max(0, timerSeconds - memorizeSeconds) : null
      if (playTimerSeconds != null && playTimerSeconds > 0 && elapsedMs >= playTimerSeconds * 1000) {
        // Finished after the time limit — no speed bonus.
      } else if (elapsedMs > 0) {
        const parMs = gridSizePairs * 15 * 1000
        const underParMs = Math.max(0, parMs - elapsedMs)
        const underParMinutes = Math.floor(underParMs / 60000)
        speedParBonus = underParMinutes * MATCHING_PAIRS_SPEED_PAR_BONUS_PER_MINUTE
      }
    }
  }

  const baseScore = pairsMatched * MATCHING_PAIRS_POINTS_PER_PAIR
  let finalScore =
    baseScore +
    streakBonusTotal +
    placementBonus +
    cleanStreakMultiplierBonus +
    speedParBonus +
    (perfectGame ? MATCHING_PAIRS_PERFECT_GAME_BONUS : 0) -
    wrongPenaltyTotal
  // Floor at 0 — unlucky starts should never produce a negative total.
  if (finalScore < 0) finalScore = 0

  let timeTakenMs: number | null = null
  if (progress.finished_at) {
    const timerAnchor = roundStartedAt ?? sessionStartedAt
    if (timerAnchor) {
      const memorizeSeconds = gridSizePairs >= 16 ? 5 : 3
      const startMs = new Date(timerAnchor).getTime() + memorizeSeconds * 1000
      timeTakenMs = new Date(progress.finished_at).getTime() - startMs
    } else if (progress.created_at) {
      timeTakenMs = new Date(progress.finished_at).getTime() - new Date(progress.created_at).getTime()
    }
    // Mark as unfinished if the player didn't match all pairs before the time limit.
    // timerSeconds includes memorization, so subtract it for a play-time comparison.
    const memorizeSeconds = gridSizePairs >= 16 ? 5 : 3
    const playTimerLimit = timerSeconds != null ? Math.max(0, timerSeconds - memorizeSeconds) : null
    if (
      pairsMatched < gridSizePairs &&
      playTimerLimit != null &&
      playTimerLimit > 0 &&
      timeTakenMs !== null &&
      timeTakenMs >= playTimerLimit * 1000
    ) {
      timeTakenMs = -1
    }
  }

  return {
    playerId: progress.player_id,
    pairsMatched,
    wrongAttempts,
    streakBonusTotal,
    longestStreak: maxStreak,
    perfectGame,
    placement,
    placementBonus,
    wrongPenaltyTotal,
    cleanStreakMultiplierBonus,
    speedParBonus,
    finalScore,
    timeTakenMs,
  }
}

/**
 * A leaderboard row with a player name attached — the shape returned by
 * buildCumulativeLeaderboard.
 */
export type MatchingPairsLeaderboardRow = MatchingPairsPlayerScore & { name: string }

/**
 * Build a cumulative leaderboard across ALL completed rounds.
 * Groups submissions and progress by (playerId, roundId), scores each round
 * independently via tallyMatchingPairsScore, then sums finalScore across rounds.
 */
export function buildCumulativeLeaderboard(
  allSubmissions: MatchingPairsSubmission[],
  allProgress: MatchingPairsProgress[],
  playerMap: Map<string, string>,
  gridSizePairs: MatchingPairsGridSize,
  sessionStartedAt: string | null,
  roundStartedAtMap?: Map<string, string>,
  timerSeconds?: number | null
): MatchingPairsLeaderboardRow[] {
  const playerIds = new Set(allProgress.map((p) => p.player_id))
  const rows: MatchingPairsLeaderboardRow[] = []

  for (const playerId of playerIds) {
    const playerSubs = allSubmissions.filter((s) => s.player_id === playerId)
    const playerProgs = allProgress.filter((p) => p.player_id === playerId)

    const roundIds = new Set(playerSubs.map((s) => s.round_id))
    for (const prog of playerProgs) roundIds.add(prog.round_id)

    let cumulativeScore = 0
    let cumulativePairs = 0
    let cumulativeWrong = 0
    let placement = 999
    let finalProg: MatchingPairsProgress | null = null

    for (const rid of roundIds) {
      const roundSubs = playerSubs.filter((s) => s.round_id === rid)
      const roundProg = playerProgs.find((p) => p.round_id === rid)
      if (!roundProg) continue
      const roundSt = roundStartedAtMap?.get(rid) ?? sessionStartedAt
      const score = tallyMatchingPairsScore(
        roundSubs,
        roundProg,
        gridSizePairs,
        sessionStartedAt,
        roundSt,
        timerSeconds
      )
      cumulativeScore += score.finalScore
      cumulativePairs += score.pairsMatched
      cumulativeWrong += score.wrongAttempts
      finalProg = roundProg
      if (roundProg.finish_rank !== null && roundProg.finish_rank < placement) {
        placement = roundProg.finish_rank
      }
    }

    if (!finalProg) continue

    rows.push({
      playerId,
      pairsMatched: cumulativePairs,
      wrongAttempts: cumulativeWrong,
      streakBonusTotal: 0,
      longestStreak: 0,
      perfectGame: false,
      placement,
      placementBonus: 0,
      wrongPenaltyTotal: cumulativeWrong * MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY,
      cleanStreakMultiplierBonus: 0,
      speedParBonus: 0,
      finalScore: cumulativeScore,
      timeTakenMs: null,
      name: playerMap.get(playerId) ?? 'Unknown',
    })
  }

  return rows.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore
    const rankA = a.placement ?? 999
    const rankB = b.placement ?? 999
    if (rankA !== rankB) return rankA - rankB
    return (a.wrongAttempts ?? 0) - (b.wrongAttempts ?? 0)
  })
}

// ── Randomization ─────────────────────────────────────────────────────────────

/** Simple xorshift32 RNG (same as Sudoku/WordHunt for consistency). */
function xorshift(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0x100000000
  }
}

function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function sampleWithoutReplacement<T>(pool: readonly T[], n: number, rng: () => number): T[] {
  const shuffled = shuffleArray([...pool], rng)
  return shuffled.slice(0, n)
}

/**
 * Build the round metadata for a Matching Pairs game.
 * Called server-side at game start.
 *
 * @param gameCode - Game ID (for embedding in metadata)
 * @param seed     - Entropy seed (Date.now() ^ random, like Sudoku)
 * @param gridSizePairs - Number of pairs (8 or 16)
 * @param playerIds - IDs of all playing (non-spectator) players
 */
export function buildMatchingPairsRoundMetadata(
  _gameCode: string,
  seed: number,
  gridSizePairs: MatchingPairsGridSize,
  playerIds: string[]
): MatchingPairsMetadata {
  const rng = xorshift(seed)

  // Sample icons and colors.
  const selectedIcons = sampleWithoutReplacement(MEMORY_MATCH_ICON_POOL, gridSizePairs, rng)
  const selectedColors = sampleWithoutReplacement(MEMORY_MATCH_PAIR_COLORS, gridSizePairs, rng)

  const pairs: MatchingPairEntry[] = selectedIcons.map((icon, i) => ({
    icon,
    color: selectedColors[i],
    pairIndex: i,
  }))

  // For each player, build a shuffled card order (each pairIndex appears twice).
  const cardOrder = pairs.flatMap((p) => [p.pairIndex, p.pairIndex])
  const playerBoards: MatchingPairsPlayerBoard[] = playerIds.map((playerId) => ({
    playerId,
    cardOrder: shuffleArray([...cardOrder], xorshift(seed ^ simpleHash(playerId))),
  }))

  return {
    gridSizePairs,
    pairs,
    playerBoards,
    seed,
  }
}

/** Simple string hash for per-player board seed derivation. */
function simpleHash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h
}

/**
 * Build the round row for insertion into `rounds`.
 * @param roundNumber - 1-indexed round number (default 1). Round 1 is active, rest are pending.
 */
export function buildMatchingPairsRoundRow(
  gameCode: string,
  metadata: MatchingPairsMetadata,
  roundNumber = 1
): Record<string, unknown> {
  return {
    game_id: gameCode,
    round_number: roundNumber,
    status: roundNumber === 1 ? 'active' : 'pending',
    started_at: roundNumber === 1 ? new Date().toISOString() : null,
    memory_match_metadata: metadata,
    participant_ids: [],
  }
}

// ── Metadata parsing ──────────────────────────────────────────────────────────

export function parseMatchingPairsMetadata(raw: unknown): MatchingPairsMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (typeof m.gridSizePairs !== 'number' || !Array.isArray(m.pairs) || !Array.isArray(m.playerBoards)) {
    return null
  }
  return m as unknown as MatchingPairsMetadata
}

/** Get this player's shuffled card order from the round metadata. */
export function getPlayerBoard(meta: MatchingPairsMetadata, playerId: string): number[] | null {
  const board = meta.playerBoards.find((b) => b.playerId === playerId)
  return board?.cardOrder ?? null
}

// ── Scoring helpers for client-side computation ───────────────────────────────

/**
 * Compute the streak bonus that would be awarded for a correct match,
 * given the current streak counter value BEFORE this match.
 * The streak counter increments first, then we check % 3 == 0.
 */
export function computeStreakBonus(streakBeforeMatch: number): number {
  const newStreak = streakBeforeMatch + 1
  return newStreak % 3 === 0 ? MATCHING_PAIRS_STREAK_BONUS : 0
}

/** Format grid size as a readable label. */
export function formatMatchingPairsGridSize(gridSizePairs: MatchingPairsGridSize): string {
  return gridSizePairs === 8 ? 'Standard (4×4)' : 'Large (8×4)'
}

/** Layout dimensions for a given grid size. */
export function matchingPairsGridLayout(gridSizePairs: MatchingPairsGridSize): { cols: number; rows: number } {
  return gridSizePairs === 8 ? { cols: 4, rows: 4 } : { cols: 8, rows: 4 }
}

// ── Game finish helpers ───────────────────────────────────────────────────────

/**
 * Check if all playing players have finished their boards.
 * Returns true if the game should be ended.
 */
export async function checkAllMatchingPairsPlayersDone(
  supabase: SupabaseClient,
  gameId: string,
  roundId: string,
  totalPairs: number
): Promise<{ allDone: boolean; error: string | null }> {
  const { data: activePlayers, error: playersError } = await supabase
    .from('players')
    .select('id')
    .eq('game_id', gameId)
    .eq('spectator', false)

  if (playersError) return { allDone: false, error: playersError.message }

  const playerIds = ((activePlayers ?? []) as { id: string }[]).map((p) => p.id)
  if (playerIds.length === 0) return { allDone: false, error: null }

  const { data: progressRows, error: progressError } = await supabase
    .from('memory_match_progress')
    .select('player_id, pairs_matched, finished')
    .eq('round_id', roundId)

  if (progressError) return { allDone: false, error: progressError.message }

  const progressMap = new Map<string, { pairs_matched: number; finished: boolean }>()
  for (const row of (progressRows ?? []) as { player_id: string; pairs_matched: number; finished: boolean }[]) {
    progressMap.set(row.player_id, row)
  }

  const allDone = playerIds.every((id) => {
    const p = progressMap.get(id)
    return p?.finished === true || (p?.pairs_matched ?? 0) >= totalPairs
  })

  return { allDone, error: null }
}

/**
 * End the game if all players have completed their boards.
 * Safe to call multiple times — no-ops if already finished.
 */
export async function finishMatchingPairsIfAllDone(
  supabase: SupabaseClient,
  gameId: string,
  roundId: string,
  totalPairs: number
): Promise<{ finished: boolean; error: string | null }> {
  const { data: game } = await supabase.from('games').select('status').eq('id', gameId).maybeSingle()
  if (game?.status !== 'active') return { finished: false, error: null }

  const { allDone, error } = await checkAllMatchingPairsPlayersDone(supabase, gameId, roundId, totalPairs)
  if (error) return { finished: false, error }
  if (!allDone) return { finished: false, error: null }

  const { error: finishError } = await markGameFinished(supabase, gameId, undefined, { onlyIfActive: true })
  return { finished: !finishError, error: finishError?.message ?? null }
}

/**
 * Called from the flip route when a player finishes their board.
 * If all players are done with this round, ends the round.
 * If this was the final round, also ends the game.
 * For non-final rounds the game stays active so the next round can start.
 */
export async function finishMatchingPairsRoundIfAllDone(
  supabase: SupabaseClient,
  gameId: string,
  roundId: string,
  roundNumber: number,
  totalRounds: number,
  totalPairs: number
): Promise<{ roundEnded: boolean; gameEnded: boolean; error: string | null }> {
  const { data: game } = await supabase.from('games').select('status').eq('id', gameId).maybeSingle()
  if (game?.status !== 'active') return { roundEnded: false, gameEnded: false, error: null }

  const { allDone, error } = await checkAllMatchingPairsPlayersDone(supabase, gameId, roundId, totalPairs)
  if (error) return { roundEnded: false, gameEnded: false, error }
  if (!allDone) return { roundEnded: false, gameEnded: false, error: null }

  // End the current round
  const now = new Date().toISOString()
  const { error: roundUpdateError } = await supabase
    .from('rounds')
    .update({ status: 'finished', ended_at: now })
    .eq('id', roundId)
  if (roundUpdateError) return { roundEnded: false, gameEnded: false, error: roundUpdateError.message }

  if (roundNumber >= totalRounds) {
    // Last round — end the game
    const { error: finishError } = await markGameFinished(supabase, gameId, now, { onlyIfActive: true })
    return { roundEnded: true, gameEnded: !finishError, error: finishError?.message ?? null }
  }

  // Non-final round — game stays active for the next round
  return { roundEnded: true, gameEnded: false, error: null }
}
