import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'
import { markGameFinished } from '@/lib/game-finish'
import type { YahtzeeCategory, YahtzeeCategoryPoints, YahtzeePlayerScore, YahtzeeSession } from '@/types'

export const YAHTZEE_MIN_PLAYERS = 1
export const YAHTZEE_MAX_PLAYERS = 6
export const YAHTZEE_DEFAULT_MAX_PLAYERS = 6

export const YAHTZEE_DICE_COUNT = 5
export const YAHTZEE_ROLLS_PER_TURN = 3

export const YAHTZEE_UPPER_BONUS_THRESHOLD = 63
export const YAHTZEE_UPPER_BONUS_POINTS = 35

export const YAHTZEE_CATEGORY_LABELS: Record<YahtzeeCategory, string> = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  three_kind: '3 of a Kind',
  four_kind: '4 of a Kind',
  full_house: 'Full House',
  small_straight: 'Sm. Straight',
  large_straight: 'Lg. Straight',
  yahtzee: 'YAHTZEE',
  chance: 'Chance',
}

export const YAHTZEE_UPPER_CATEGORIES: YahtzeeCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']

export const YAHTZEE_LOWER_CATEGORIES: YahtzeeCategory[] = [
  'three_kind',
  'four_kind',
  'full_house',
  'small_straight',
  'large_straight',
  'yahtzee',
  'chance',
]

export const YAHTZEE_ALL_CATEGORIES: YahtzeeCategory[] = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'three_kind',
  'four_kind',
  'full_house',
  'small_straight',
  'large_straight',
  'yahtzee',
  'chance',
]

export function emptyCategoryPoints(): YahtzeeCategoryPoints {
  return {
    ones: null,
    twos: null,
    threes: null,
    fours: null,
    fives: null,
    sixes: null,
    three_kind: null,
    four_kind: null,
    full_house: null,
    small_straight: null,
    large_straight: null,
    yahtzee: null,
    chance: null,
  }
}

export function countFaces(dice: number[]): Record<number, number> {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  for (const d of dice) {
    if (d >= 1 && d <= 6) counts[d] += 1
  }
  return counts
}

export function rollUnheldDice(dice: number[], held: boolean[]): number[] {
  return dice.map((d, i) => (held[i] ? d : Math.floor(Math.random() * 6) + 1))
}

function isConsecutiveRun(dice: number[], run: number[]): boolean {
  const unique = new Set(dice)
  return run.every((n) => unique.has(n))
}

export function categoryScore(dice: number[], category: YahtzeeCategory): number {
  const counts = countFaces(dice)
  const total = dice.reduce((sum, n) => sum + n, 0)

  switch (category) {
    case 'ones':
    case 'twos':
    case 'threes':
    case 'fours':
    case 'fives':
    case 'sixes': {
      const face =
        category === 'ones'
          ? 1
          : category === 'twos'
            ? 2
            : category === 'threes'
              ? 3
              : category === 'fours'
                ? 4
                : category === 'fives'
                  ? 5
                  : 6
      return counts[face] * face
    }
    case 'three_kind': {
      const hasThree = Object.values(counts).some((c) => c >= 3)
      return hasThree ? total : 0
    }
    case 'four_kind': {
      const hasFour = Object.values(counts).some((c) => c >= 4)
      return hasFour ? total : 0
    }
    case 'full_house': {
      const values = Object.values(counts)
      const hasPair = values.some((c) => c === 2)
      const hasThree = values.some((c) => c === 3)
      // MVP rules: Yahtzee does NOT count as full house.
      const hasYahtzee = values.some((c) => c === 5)
      return hasPair && hasThree && !hasYahtzee ? 25 : 0
    }
    case 'small_straight': {
      // Standard runs: 1-2-3-4 or 2-3-4-5 or 3-4-5-6.
      return isConsecutiveRun(dice, [1, 2, 3, 4]) ||
        isConsecutiveRun(dice, [2, 3, 4, 5]) ||
        isConsecutiveRun(dice, [3, 4, 5, 6])
        ? 30
        : 0
    }
    case 'large_straight': {
      return isConsecutiveRun(dice, [1, 2, 3, 4, 5]) || isConsecutiveRun(dice, [2, 3, 4, 5, 6]) ? 40 : 0
    }
    case 'yahtzee': {
      return Object.values(counts).some((c) => c === 5) ? 50 : 0
    }
    case 'chance':
      return total
  }
}

export function upperScore(points: YahtzeeCategoryPoints): number {
  return (
    (points.ones ?? 0) +
    (points.twos ?? 0) +
    (points.threes ?? 0) +
    (points.fours ?? 0) +
    (points.fives ?? 0) +
    (points.sixes ?? 0)
  )
}

export function upperBonus(points: YahtzeeCategoryPoints): number {
  const u = upperScore(points)
  return u >= YAHTZEE_UPPER_BONUS_THRESHOLD ? YAHTZEE_UPPER_BONUS_POINTS : 0
}

export function totalScore(points: YahtzeeCategoryPoints): number {
  const lower =
    (points.three_kind ?? 0) +
    (points.four_kind ?? 0) +
    (points.full_house ?? 0) +
    (points.small_straight ?? 0) +
    (points.large_straight ?? 0) +
    (points.yahtzee ?? 0) +
    (points.chance ?? 0)

  return upperScore(points) + upperBonus(points) + lower
}

export function hasAnyUnusedCategory(points: YahtzeeCategoryPoints): boolean {
  return YAHTZEE_ALL_CATEGORIES.some((c) => points[c] == null)
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function currentPlayerId(session: YahtzeeSession): string | null {
  const order = session.turn_order ?? []
  if (order.length === 0) return null
  return order[session.current_turn_index % order.length] ?? null
}

/** Returns an ISO deadline string `secondsFromNow` seconds in the future, or null if timer is disabled (0). */
export function yahtzeeTurnDeadline(timerSeconds: number): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(Date.now() + timerSeconds * 1000).toISOString()
}

/** Seconds remaining until a deadline (0 if no deadline or already expired). */
export function yahtzeeSecondsLeft(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

/** Pick the best category to auto-score when time expires (chance first, then first unscored). */
export function pickAutoScoreCategory(categories: YahtzeeCategoryPoints): YahtzeeCategory | null {
  if (categories['chance'] == null) return 'chance'
  for (const cat of YAHTZEE_ALL_CATEGORIES) {
    if (categories[cat] == null) return cat
  }
  return null
}

/**
 * Optimistic-concurrency session write. The update only lands if the row still
 * carries the `expectedUpdatedAt` we read, so when two requests race (e.g. every
 * client driving the turn timer) only the first wins — the loser gets 0 rows and
 * the caller aborts before writing scores or finalizing. Returns true if this
 * write won. The patch carries `turn_deadline_at` itself, so each call site keeps
 * its existing deadline behavior (roll refreshes, score advances, finish clears).
 */
async function persistSession(
  supabase: SupabaseClient,
  gameId: string,
  patch: Partial<YahtzeeSession>,
  expectedUpdatedAt: string
): Promise<boolean> {
  const { data } = await supabase
    .from('yahtzee_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('updated_at', expectedUpdatedAt)
    .select('game_id')
  return (data?.length ?? 0) > 0
}

export async function initializeYahtzeeGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  const turnOrder = shuffle(playerIds)
  const sessionRow: Partial<YahtzeeSession> = {
    game_id: gameId,
    turn_order: turnOrder,
    current_turn_index: 0,
    phase: 'rolling',
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    rolls_remaining: YAHTZEE_ROLLS_PER_TURN,
    rolls_this_turn: 0,
    status_message: 'First player — roll the dice.',
    winner_player_id: null,
  }

  const { error: sessionError } = await supabase.from('yahtzee_sessions').insert(sessionRow)
  if (sessionError) return { error: sessionError.message }

  const scoreRows: Array<{
    game_id: string
    player_id: string
    scores: { categories: YahtzeeCategoryPoints }
    player_order: number
  }> = turnOrder.map((playerId, index) => ({
    game_id: gameId,
    player_id: playerId,
    scores: { categories: emptyCategoryPoints() },
    player_order: index,
  }))

  const { error: scoresError } = await supabase.from('yahtzee_player_scores').insert(scoreRows)
  if (scoresError) return { error: scoresError.message }

  return {}
}

export async function clearYahtzeeSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['yahtzee_sessions', 'yahtzee_player_scores'], { resetSpectators: true })
}

export async function processYahtzeeRoll(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const [sessionRes, gameRes] = await Promise.all([
    supabase.from('yahtzee_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle(),
  ])
  const session = sessionRes.data
  if (!session) return { error: 'Session not found' }

  const { data: scoresRows } = await supabase
    .from('yahtzee_player_scores')
    .select('player_id, scores')
    .eq('game_id', gameId)

  if (!scoresRows) return { error: 'Scores not found' }

  const currentId = currentPlayerId(session as YahtzeeSession)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (session.phase !== 'rolling') return { error: 'Cannot roll right now' }
  if ((session.rolls_remaining ?? 0) <= 0) return { error: 'No rolls remaining' }

  const dice = (session.dice as number[]) ?? [1, 1, 1, 1, 1]
  const held = (session.held as boolean[]) ?? [false, false, false, false, false]
  const nextDice = rollUnheldDice(dice, held)

  const rolls_remaining = Math.max(0, (session.rolls_remaining ?? 0) - 1)
  const rolls_this_turn = (session.rolls_this_turn ?? 0) + 1

  // Set / refresh the per-turn deadline on every roll so the player gets
  // the full time window from their last roll (not from start of turn).
  const timerSeconds = (gameRes.data?.timer_seconds ?? 0) as number
  const turn_deadline_at = yahtzeeTurnDeadline(timerSeconds)

  // Claim the turn via CAS — if another request already advanced this session
  // from the exact state we read, we lose the race and bail without re-rolling.
  await persistSession(
    supabase,
    gameId,
    {
      dice: nextDice,
      rolls_remaining,
      rolls_this_turn,
      turn_deadline_at,
      status_message:
        rolls_remaining > 0 ? `Roll again (${rolls_remaining} left) or score.` : 'Rolls used — score your turn!',
    },
    session.updated_at
  )

  return {}
}

export async function processYahtzeeHold(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  held: boolean[]
): Promise<{ error?: string }> {
  const { data: session } = await supabase.from('yahtzee_sessions').select('*').eq('game_id', gameId).maybeSingle()
  if (!session) return { error: 'Session not found' }

  const currentId = currentPlayerId(session as YahtzeeSession)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (session.phase !== 'rolling') return { error: 'Cannot hold right now' }
  if ((session.rolls_this_turn ?? 0) < 1) return { error: 'Roll at least once before keeping dice' }
  if (!Array.isArray(held) || held.length !== YAHTZEE_DICE_COUNT) return { error: 'Invalid held array' }

  // CAS so a hold that lost the race against a concurrent roll/score/advance is
  // dropped rather than stamping a stale `held` onto the next player's turn.
  await persistSession(supabase, gameId, { held }, session.updated_at)

  return {}
}

function nextUnfinishedIndex(order: string[], scores: YahtzeePlayerScore[], startIndex: number): number | null {
  if (order.length === 0) return null
  for (let i = 1; i <= order.length; i += 1) {
    const next = (startIndex + i) % order.length
    const playerId = order[next]!
    const row = scores.find((s) => s.player_id === playerId)
    if (row && hasAnyUnusedCategory(row.scores.categories)) return next
  }
  return null
}

export async function processYahtzeeScore(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  category: YahtzeeCategory
): Promise<{ error?: string }> {
  const [sessionRes, gameRes] = await Promise.all([
    supabase.from('yahtzee_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle(),
  ])
  const session = sessionRes.data
  if (!session) return { error: 'Session not found' }
  const timerSeconds = (gameRes.data?.timer_seconds ?? 0) as number

  const currentId = currentPlayerId(session as YahtzeeSession)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (session.phase !== 'rolling') return { error: 'Cannot score right now' }
  if ((session.rolls_this_turn ?? 0) < 1) return { error: 'Roll at least once before scoring' }

  const dice = (session.dice as number[]) ?? [1, 1, 1, 1, 1]
  const score = categoryScore(dice, category)

  const { data: scoresRows } = await supabase.from('yahtzee_player_scores').select('*').eq('game_id', gameId)

  if (!scoresRows || scoresRows.length === 0) return { error: 'Scores not found' }

  const playerRow = (scoresRows as YahtzeePlayerScore[]).find((r) => r.player_id === playerId)
  if (!playerRow) return { error: 'Player scores not found' }

  const currentPoints = playerRow.scores.categories
  if (currentPoints[category] != null) return { error: 'Category already scored' }

  const nextPoints: YahtzeeCategoryPoints = { ...currentPoints, [category]: score }

  const updatedScoresRows = (scoresRows as YahtzeePlayerScore[]).map((r) =>
    r.player_id === playerId ? { ...r, scores: { ...r.scores, categories: nextPoints } } : r
  )

  const allComplete = updatedScoresRows.every((r) => !hasAnyUnusedCategory(r.scores.categories))
  if (allComplete) {
    const totals = updatedScoresRows.map((r) => ({
      playerId: r.player_id,
      total: totalScore(r.scores.categories),
    }))
    const max = Math.max(...totals.map((t) => t.total))
    const winners = totals.filter((t) => t.total === max).map((t) => t.playerId)
    const winnerPlayerId = winners.length === 1 ? winners[0] : null

    // Claim the session FIRST. Only the request that wins the CAS writes the score
    // row and finalizes, so a player action racing the timer can't double-write the
    // category cell or decide the winner twice.
    const won = await persistSession(
      supabase,
      gameId,
      {
        phase: 'finished',
        winner_player_id: winnerPlayerId,
        turn_deadline_at: null,
        status_message: 'Game over — thanks for playing!',
      },
      session.updated_at
    )
    if (!won) return {}

    const { error: updateScoreError } = await supabase
      .from('yahtzee_player_scores')
      .update({ scores: { categories: nextPoints } })
      .eq('game_id', gameId)
      .eq('player_id', playerId)
    if (updateScoreError) return { error: updateScoreError.message }

    const { error: gameError } = await markGameFinished(supabase, gameId)
    if (gameError) return { error: gameError.message }
    return {}
  }

  const order = (session.turn_order as string[]) ?? []
  const nextIndex = nextUnfinishedIndex(order, updatedScoresRows, session.current_turn_index)
  if (nextIndex == null) {
    // Should not happen because allComplete is false, but handle defensively.
    const won = await persistSession(supabase, gameId, { phase: 'finished' }, session.updated_at)
    if (!won) return {}
    const { error: updateScoreError } = await supabase
      .from('yahtzee_player_scores')
      .update({ scores: { categories: nextPoints } })
      .eq('game_id', gameId)
      .eq('player_id', playerId)
    if (updateScoreError) return { error: updateScoreError.message }
    return {}
  }

  const resetDice = [1, 1, 1, 1, 1]
  const resetHeld = [false, false, false, false, false]

  // Claim the turn before writing the score row, so a request that lost the race
  // never records its score into the (now stale) category.
  const won = await persistSession(
    supabase,
    gameId,
    {
      current_turn_index: nextIndex,
      dice: resetDice,
      held: resetHeld,
      rolls_remaining: YAHTZEE_ROLLS_PER_TURN,
      rolls_this_turn: 0,
      // Start the next player's deadline immediately so they have the full window
      turn_deadline_at: yahtzeeTurnDeadline(timerSeconds),
      status_message: 'Next player — roll the dice.',
    },
    session.updated_at
  )
  if (!won) return {}

  const { error: updateScoreError } = await supabase
    .from('yahtzee_player_scores')
    .update({ scores: { categories: nextPoints } })
    .eq('game_id', gameId)
    .eq('player_id', playerId)
  if (updateScoreError) return { error: updateScoreError.message }

  return {}
}

// ── Expire turn (timer ran out) ──────────────────────────────────────────────

/** Called when turn_deadline_at has passed. Forces a score and advances the turn. */
export async function processYahtzeeExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; skipped?: boolean }> {
  const [sessionRes, gameRes, scoresRes] = await Promise.all([
    supabase.from('yahtzee_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle(),
    supabase.from('yahtzee_player_scores').select('*').eq('game_id', gameId),
  ])

  const session = sessionRes.data
  if (!session) return { error: 'Session not found' }
  if (session.phase !== 'rolling') return { skipped: true }

  // Check deadline is genuinely expired
  if (!session.turn_deadline_at || new Date(session.turn_deadline_at) > new Date()) {
    return { skipped: true }
  }

  const scoresRows = (scoresRes.data as YahtzeePlayerScore[]) ?? []
  const timerSeconds = (gameRes.data?.timer_seconds ?? 0) as number
  const currentId = currentPlayerId(session as YahtzeeSession)
  if (!currentId) return { error: 'No current player' }

  // If no rolls yet, do a fresh roll of all dice
  let dice = (session.dice as number[]) ?? [1, 1, 1, 1, 1]
  if ((session.rolls_this_turn ?? 0) === 0) {
    dice = rollUnheldDice([1, 1, 1, 1, 1], [false, false, false, false, false])
  }

  // Find a category to auto-score
  const playerRow = scoresRows.find((r) => r.player_id === currentId)
  if (!playerRow) return { error: 'Player scores not found' }

  const category = pickAutoScoreCategory(playerRow.scores.categories)
  if (!category) return { error: 'No available category' }

  const score = categoryScore(dice, category)
  const nextPoints: YahtzeeCategoryPoints = { ...playerRow.scores.categories, [category]: score }

  const updatedScoresRows = scoresRows.map((r) =>
    r.player_id === currentId ? { ...r, scores: { categories: nextPoints } } : r
  )

  const allComplete = updatedScoresRows.every((r) => !hasAnyUnusedCategory(r.scores.categories))
  if (allComplete) {
    const totals = updatedScoresRows.map((r) => ({
      playerId: r.player_id,
      total: totalScore(r.scores.categories),
    }))
    const max = Math.max(...totals.map((t) => t.total))
    const winners = totals.filter((t) => t.total === max).map((t) => t.playerId)
    const winnerPlayerId = winners.length === 1 ? winners[0] : null

    // Claim FIRST. Two timer fires re-roll DIFFERENT random dice; only the request
    // that wins the CAS commits its dice's auto-score and decides the winner — the
    // loser bails without touching the score row, keeping the cell single-valued.
    const won = await persistSession(
      supabase,
      gameId,
      {
        phase: 'finished',
        winner_player_id: winnerPlayerId,
        turn_deadline_at: null,
      },
      session.updated_at
    )
    if (!won) return { skipped: true }

    const { error: updateScoreError } = await supabase
      .from('yahtzee_player_scores')
      .update({ scores: { categories: nextPoints } })
      .eq('game_id', gameId)
      .eq('player_id', currentId)
    if (updateScoreError) return { error: updateScoreError.message }

    await markGameFinished(supabase, gameId)
    return {}
  }

  const order = (session.turn_order as string[]) ?? []
  const nextIndex = nextUnfinishedIndex(order, updatedScoresRows, session.current_turn_index)
  if (nextIndex == null) {
    const won = await persistSession(
      supabase,
      gameId,
      { phase: 'finished', turn_deadline_at: null },
      session.updated_at
    )
    if (!won) return { skipped: true }
    const { error: updateScoreError } = await supabase
      .from('yahtzee_player_scores')
      .update({ scores: { categories: nextPoints } })
      .eq('game_id', gameId)
      .eq('player_id', currentId)
    if (updateScoreError) return { error: updateScoreError.message }
    return {}
  }

  // Claim the turn before writing the auto-score, so only the winning timer fire
  // records its random dice's score into the category.
  const won = await persistSession(
    supabase,
    gameId,
    {
      current_turn_index: nextIndex,
      dice,
      held: [false, false, false, false, false],
      rolls_remaining: YAHTZEE_ROLLS_PER_TURN,
      rolls_this_turn: 0,
      turn_deadline_at: yahtzeeTurnDeadline(timerSeconds),
      status_message: 'Turn skipped (time ran out). Next player — roll the dice.',
    },
    session.updated_at
  )
  if (!won) return { skipped: true }

  const { error: updateScoreError } = await supabase
    .from('yahtzee_player_scores')
    .update({ scores: { categories: nextPoints } })
    .eq('game_id', gameId)
    .eq('player_id', currentId)
  if (updateScoreError) return { error: updateScoreError.message }

  return {}
}

export type YahtzeeHostMode = 'spectator' | 'player'

const yahtzeeHostModeKey = (gameCode: string) => `yahtzee_host_mode_${gameCode}`

export function getYahtzeeHostMode(gameCode: string): YahtzeeHostMode {
  if (typeof window === 'undefined') return 'spectator'
  return localStorage.getItem(yahtzeeHostModeKey(gameCode)) === 'player' ? 'player' : 'spectator'
}

export function setYahtzeeHostMode(gameCode: string, mode: YahtzeeHostMode): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(yahtzeeHostModeKey(gameCode), mode)
}

/**
 * Remove a player from a Yahtzee game (they left or were kicked). Without this the
 * player's id stayed in `turn_order`, so the game kept handing them turns — a ghost
 * with no name, and a timer counting down on a player who was gone. Drop them from
 * the turn order (fixing current_turn_index), delete their scores, end the game if
 * fewer than two players remain (highest scorer wins), then delete their player row.
 *
 * The session write is a plain (non-CAS) update on purpose: a removal must always
 * land — a lost optimistic-concurrency race would otherwise leave the ghost behind.
 */
export async function removeYahtzeePlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerName?: string
): Promise<{ error: string | null }> {
  const { data: sessionRaw } = await supabase.from('yahtzee_sessions').select('*').eq('game_id', gameId).maybeSingle()
  const session = sessionRaw as YahtzeeSession | null
  const order = session ? [...(session.turn_order ?? [])] : []
  const removedIndex = order.indexOf(playerId)

  if (session && removedIndex >= 0 && session.phase !== 'finished') {
    const turnOrder = order.filter((id) => id !== playerId)
    let currentTurnIndex = session.current_turn_index
    if (removedIndex < currentTurnIndex) currentTurnIndex -= 1
    else if (removedIndex === currentTurnIndex && turnOrder.length > 0) currentTurnIndex %= turnOrder.length
    if (turnOrder.length === 0) currentTurnIndex = 0

    const removedName = playerName ?? 'A player'
    const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
    const timerSeconds = (gameRow?.timer_seconds ?? 0) as number
    const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
    const names = new Map<string, string>()
    for (const p of playerRows ?? []) names.set(p.id, p.name)

    const { data: scoresRaw } = await supabase.from('yahtzee_player_scores').select('*').eq('game_id', gameId)
    const remainingScores = ((scoresRaw ?? []) as YahtzeePlayerScore[]).filter((s) => turnOrder.includes(s.player_id))

    const update: Record<string, unknown> = {
      turn_order: turnOrder,
      current_turn_index: currentTurnIndex,
      updated_at: new Date().toISOString(),
    }

    const finishing = turnOrder.length < 2
    if (finishing) {
      // Not enough players to keep going — the highest-scoring remaining player wins.
      let winnerPlayerId: string | null = turnOrder[0] ?? null
      if (remainingScores.length > 0) {
        const totals = remainingScores.map((s) => ({ playerId: s.player_id, total: totalScore(s.scores.categories) }))
        const max = Math.max(...totals.map((t) => t.total))
        const leaders = totals.filter((t) => t.total === max)
        if (leaders.length === 1) winnerPlayerId = leaders[0].playerId
      }
      const winnerName = winnerPlayerId ? (names.get(winnerPlayerId) ?? 'Winner') : null
      update.phase = 'finished'
      update.winner_player_id = winnerPlayerId
      update.status_message = winnerName
        ? `${removedName} left — ${winnerName} wins!`
        : `${removedName} left — game over.`
      update.turn_deadline_at = null
    } else {
      const nextPlayerId = turnOrder[currentTurnIndex]
      update.dice = [1, 1, 1, 1, 1]
      update.held = [false, false, false, false, false]
      update.rolls_remaining = YAHTZEE_ROLLS_PER_TURN
      update.rolls_this_turn = 0
      update.status_message = `${removedName} left. ${names.get(nextPlayerId) ?? 'Next player'} — roll the dice.`
      update.turn_deadline_at = yahtzeeTurnDeadline(timerSeconds)
    }

    const { error: sessionError } = await supabase.from('yahtzee_sessions').update(update).eq('game_id', gameId)
    if (sessionError) return { error: sessionError.message }

    await supabase.from('yahtzee_player_scores').delete().eq('game_id', gameId).eq('player_id', playerId)
    if (finishing) await markGameFinished(supabase, gameId)
    const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
    return { error: error?.message ?? null }
  }

  // Lobby, spectator, already-finished, or not in the turn order — just drop their scores + row.
  await supabase.from('yahtzee_player_scores').delete().eq('game_id', gameId).eq('player_id', playerId)
  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  return { error: error?.message ?? null }
}
