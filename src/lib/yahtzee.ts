import type { SupabaseClient } from '@supabase/supabase-js'
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

export const YAHTZEE_UPPER_CATEGORIES: YahtzeeCategory[] = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
]

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
      const face = category === 'ones' ? 1 : category === 'twos' ? 2 : category === 'threes' ? 3 : category === 'fours' ? 4 : category === 'fives' ? 5 : 6
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
      return isConsecutiveRun(dice, [1, 2, 3, 4]) || isConsecutiveRun(dice, [2, 3, 4, 5]) || isConsecutiveRun(dice, [3, 4, 5, 6])
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
export function pickAutoScoreCategory(
  categories: YahtzeeCategoryPoints
): YahtzeeCategory | null {
  if (categories['chance'] == null) return 'chance'
  for (const cat of YAHTZEE_ALL_CATEGORIES) {
    if (categories[cat] == null) return cat
  }
  return null
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
): Promise<{ error?: string }> {
  const { error: sessionError } = await supabase.from('yahtzee_sessions').delete().eq('game_id', gameId)
  if (sessionError) return { error: sessionError.message }

  const { error: scoresError } = await supabase.from('yahtzee_player_scores').delete().eq('game_id', gameId)
  if (scoresError) return { error: scoresError.message }

  return {}
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

  const { error: sessionError } = await supabase
    .from('yahtzee_sessions')
    .update({
      dice: nextDice,
      rolls_remaining,
      rolls_this_turn,
      turn_deadline_at,
      updated_at: new Date().toISOString(),
      status_message: rolls_remaining > 0 ? `Roll again (${rolls_remaining} left) or score.` : 'Rolls used — score your turn!',
    })
    .eq('game_id', gameId)

  if (sessionError) return { error: sessionError.message }
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

  const { error: sessionError } = await supabase
    .from('yahtzee_sessions')
    .update({ held, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)

  if (sessionError) return { error: sessionError.message }
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

  const { data: scoresRows } = await supabase
    .from('yahtzee_player_scores')
    .select('*')
    .eq('game_id', gameId)

  if (!scoresRows || scoresRows.length === 0) return { error: 'Scores not found' }

  const playerRow = (scoresRows as YahtzeePlayerScore[]).find((r) => r.player_id === playerId)
  if (!playerRow) return { error: 'Player scores not found' }

  const currentPoints = playerRow.scores.categories
  if (currentPoints[category] != null) return { error: 'Category already scored' }

  const nextPoints: YahtzeeCategoryPoints = { ...currentPoints, [category]: score }

  const { error: updateScoreError } = await supabase
    .from('yahtzee_player_scores')
    .update({ scores: { categories: nextPoints } })
    .eq('game_id', gameId)
    .eq('player_id', playerId)

  if (updateScoreError) return { error: updateScoreError.message }

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

    const { error: sessionError } = await supabase
      .from('yahtzee_sessions')
      .update({
        phase: 'finished',
        winner_player_id: winnerPlayerId,
        turn_deadline_at: null,
        status_message: 'Game over — thanks for playing!',
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
    if (sessionError) return { error: sessionError.message }

    const { error: gameError } = await markGameFinished(supabase, gameId)
    if (gameError) return { error: gameError.message }
    return {}
  }

  const order = (session.turn_order as string[]) ?? []
  const nextIndex = nextUnfinishedIndex(order, updatedScoresRows, session.current_turn_index)
  if (nextIndex == null) {
    // Should not happen because allComplete is false, but handle defensively.
    const { error: sessionError } = await supabase
      .from('yahtzee_sessions')
      .update({ phase: 'finished', updated_at: new Date().toISOString() })
      .eq('game_id', gameId)
    if (sessionError) return { error: sessionError.message }
    return {}
  }

  const resetDice = [1, 1, 1, 1, 1]
  const resetHeld = [false, false, false, false, false]

  const { error: sessionError } = await supabase
    .from('yahtzee_sessions')
    .update({
      current_turn_index: nextIndex,
      dice: resetDice,
      held: resetHeld,
      rolls_remaining: YAHTZEE_ROLLS_PER_TURN,
      rolls_this_turn: 0,
      // Start the next player's deadline immediately so they have the full window
      turn_deadline_at: yahtzeeTurnDeadline(timerSeconds),
      status_message: 'Next player — roll the dice.',
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  if (sessionError) return { error: sessionError.message }
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

  const { error: updateScoreError } = await supabase
    .from('yahtzee_player_scores')
    .update({ scores: { categories: nextPoints } })
    .eq('game_id', gameId)
    .eq('player_id', currentId)

  if (updateScoreError) return { error: updateScoreError.message }

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

    const { error: se } = await supabase
      .from('yahtzee_sessions')
      .update({ phase: 'finished', winner_player_id: winnerPlayerId, turn_deadline_at: null, updated_at: new Date().toISOString() })
      .eq('game_id', gameId)
    if (se) return { error: se.message }
    await markGameFinished(supabase, gameId)
    return {}
  }

  const order = (session.turn_order as string[]) ?? []
  const nextIndex = nextUnfinishedIndex(order, updatedScoresRows, session.current_turn_index)
  if (nextIndex == null) {
    await supabase
      .from('yahtzee_sessions')
      .update({ phase: 'finished', turn_deadline_at: null, updated_at: new Date().toISOString() })
      .eq('game_id', gameId)
    return {}
  }

  const { error: se } = await supabase
    .from('yahtzee_sessions')
    .update({
      current_turn_index: nextIndex,
      dice,
      held: [false, false, false, false, false],
      rolls_remaining: YAHTZEE_ROLLS_PER_TURN,
      rolls_this_turn: 0,
      turn_deadline_at: yahtzeeTurnDeadline(timerSeconds),
      status_message: 'Turn skipped (time ran out). Next player — roll the dice.',
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  if (se) return { error: se.message }
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
