/**
 * Yahtzee — solo (vs-bot) pure state machine.
 *
 * Reuses `yahtzee.ts`'s pure fns (`categoryScore`, `rollUnheldDice`,
 * `emptyCategoryPoints`, `hasAnyUnusedCategory`, `totalScore`,
 * `yahtzeeBonusEligible`, `jokerApplies`) so game rules match the server
 * route without duplicating them.
 *
 * Same shape convention as `ayo-solo` / `ludo-solo`: no supabase, no async,
 * no timers, no realtime. Safe to serialize to sessionStorage.
 *
 * Rules mirrored:
 *   - 3 rolls per turn (each roll re-rolls unheld dice).
 *   - Held bits set between rolls, applied on the NEXT roll only.
 *   - Score once per turn — commits to a category, turn advances.
 *   - Bonus Yahtzee: extra Yahtzees after the first score +100 flat.
 *   - Joker rule: a Yahtzee after Yahtzee-is-filled fills the lower-combo
 *     categories at their max regardless of dice (per `categoryScore`'s
 *     `joker` opt-in).
 *   - Game ends when both cards have every category filled.
 */

import type { YahtzeeCategory, YahtzeeCategoryPoints, YahtzeePlayerScore, YahtzeeSession } from '@/types'
import {
  YAHTZEE_ALL_CATEGORIES,
  YAHTZEE_DICE_COUNT,
  YAHTZEE_ROLLS_PER_TURN,
  categoryScore,
  emptyCategoryPoints,
  hasAnyUnusedCategory,
  jokerApplies,
  rollUnheldDice,
  totalScore,
  yahtzeeBonusEligible,
} from '@/lib/yahtzee'

// ── Types ────────────────────────────────────────────────────────────────────

export type YahtzeeSoloOutcome = 'human' | 'bot' | 'draw' | null

/** Extra bonus-Yahtzee count kept per player alongside the base categories. */
export interface YahtzeeSoloScoreCard {
  categories: YahtzeeCategoryPoints
  bonusYahtzees: number
  jokerUsed: boolean
}

export type YahtzeeSoloState = {
  session: YahtzeeSession
  /** Score card per player, keyed by player id in a plain record for JSON safety. */
  scores: Record<string, YahtzeeSoloScoreCard>
  outcome: YahtzeeSoloOutcome
  log: string[]
}

export type YahtzeeSoloStepResult = { state: YahtzeeSoloState; error?: string }

export const YAHTZEE_SOLO_HUMAN_ID = 'player_a'
export const YAHTZEE_SOLO_BOT_ID = 'player_b'
const LOG_LIMIT = 12
const NAMES: Record<string, string> = {
  [YAHTZEE_SOLO_HUMAN_ID]: 'You',
  [YAHTZEE_SOLO_BOT_ID]: 'Bot',
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initYahtzeeSolo(): YahtzeeSoloState {
  const now = new Date(0).toISOString()
  const session: YahtzeeSession = {
    id: 'solo',
    game_id: 'solo',
    turn_order: [YAHTZEE_SOLO_HUMAN_ID, YAHTZEE_SOLO_BOT_ID],
    current_turn_index: 0,
    phase: 'rolling',
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    rolls_remaining: YAHTZEE_ROLLS_PER_TURN,
    rolls_this_turn: 0,
    status_message: 'Your turn — roll the dice',
    winner_player_id: null,
    turn_deadline_at: null,
    created_at: now,
    updated_at: now,
  }
  return {
    session,
    scores: {
      [YAHTZEE_SOLO_HUMAN_ID]: emptyCard(),
      [YAHTZEE_SOLO_BOT_ID]: emptyCard(),
    },
    outcome: null,
    log: [],
  }
}

function emptyCard(): YahtzeeSoloScoreCard {
  return { categories: emptyCategoryPoints(), bonusYahtzees: 0, jokerUsed: false }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function currentPlayerId(session: YahtzeeSession): string {
  return session.turn_order[session.current_turn_index] ?? YAHTZEE_SOLO_HUMAN_ID
}

function nextTurnIndex(session: YahtzeeSession): number {
  return (session.current_turn_index + 1) % session.turn_order.length
}

function appendLog(log: string[], line: string): string[] {
  const next = [...log, line]
  return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next
}

function rollFive(): number[] {
  return Array.from({ length: YAHTZEE_DICE_COUNT }, () => 1 + Math.floor(Math.random() * 6))
}

function allCardsFull(scores: Record<string, YahtzeeSoloScoreCard>): boolean {
  return Object.values(scores).every((card) => !hasAnyUnusedCategory(card.categories))
}

function outcomeFromScores(scores: Record<string, YahtzeeSoloScoreCard>): YahtzeeSoloOutcome {
  const h = totalScore(scores[YAHTZEE_SOLO_HUMAN_ID]!.categories, scores[YAHTZEE_SOLO_HUMAN_ID]!.bonusYahtzees)
  const b = totalScore(scores[YAHTZEE_SOLO_BOT_ID]!.categories, scores[YAHTZEE_SOLO_BOT_ID]!.bonusYahtzees)
  if (h > b) return 'human'
  if (b > h) return 'bot'
  return 'draw'
}

// ── Roll ─────────────────────────────────────────────────────────────────────

/**
 * Roll (or re-roll) dice for the current player. `presetDice` is a test-only
 * injection point.
 *
 * Rules:
 *   - Only the current-turn player can roll.
 *   - First roll of the turn always rolls all 5 dice, ignoring `held`.
 *   - Subsequent rolls re-roll only unheld dice.
 *   - Session tracks rolls_remaining (starts at 3, decrements per roll).
 */
export function rollYahtzeeSolo(
  state: YahtzeeSoloState,
  actorId: string,
  presetDice?: number[]
): YahtzeeSoloStepResult {
  if (state.outcome != null) return { state, error: 'Game finished' }
  if (state.session.phase !== 'rolling') return { state, error: 'Cannot roll right now' }
  const turnId = currentPlayerId(state.session)
  if (turnId !== actorId) return { state, error: 'Not your turn' }
  if (state.session.rolls_remaining <= 0) return { state, error: 'No rolls remaining' }

  const isFirstRoll = state.session.rolls_this_turn === 0
  // First roll ignores held (fresh turn); subsequent rolls respect held bits.
  const nextDice = presetDice ?? (isFirstRoll ? rollFive() : rollUnheldDice(state.session.dice, state.session.held))

  const rolls_remaining = Math.max(0, state.session.rolls_remaining - 1)
  const rolls_this_turn = state.session.rolls_this_turn + 1

  const name = NAMES[actorId] ?? 'Player'
  const session: YahtzeeSession = {
    ...state.session,
    dice: nextDice,
    // Reset held to all-false on the first roll of a turn so stale held bits
    // from the previous player's turn don't cling.
    held: isFirstRoll ? [false, false, false, false, false] : state.session.held,
    rolls_remaining,
    rolls_this_turn,
    status_message:
      rolls_remaining > 0
        ? `Rolled — hold what you want, ${rolls_remaining} roll(s) left, or score.`
        : 'Rolls used — score now.',
  }
  return {
    state: { ...state, session, log: appendLog(state.log, `${name} rolled [${nextDice.join(', ')}]`) },
  }
}

// ── Hold ─────────────────────────────────────────────────────────────────────

/**
 * Set which dice the current player is holding for the NEXT roll. No effect on
 * dice values themselves; just marks which are locked. Held is reset at the
 * start of every turn.
 */
export function setYahtzeeSoloHold(state: YahtzeeSoloState, actorId: string, held: boolean[]): YahtzeeSoloStepResult {
  if (state.outcome != null) return { state, error: 'Game finished' }
  if (state.session.phase !== 'rolling') return { state, error: 'Cannot hold right now' }
  const turnId = currentPlayerId(state.session)
  if (turnId !== actorId) return { state, error: 'Not your turn' }
  if (state.session.rolls_this_turn < 1) return { state, error: 'Roll at least once before holding' }
  if (held.length !== YAHTZEE_DICE_COUNT) return { state, error: 'Invalid held length' }
  return { state: { ...state, session: { ...state.session, held } } }
}

// ── Score ────────────────────────────────────────────────────────────────────

/**
 * Commit the current dice to a category and advance the turn.
 *
 * Applies:
 *   - Yahtzee bonus (+100 flat) if this dice roll qualifies (`yahtzeeBonusEligible`).
 *   - Joker rule for lower-combo categories when applicable (`jokerApplies`).
 *   - Turn advance to the next player OR game-end if all cards are full.
 */
export function scoreYahtzeeSolo(
  state: YahtzeeSoloState,
  actorId: string,
  category: YahtzeeCategory
): YahtzeeSoloStepResult {
  if (state.outcome != null) return { state, error: 'Game finished' }
  if (state.session.phase !== 'rolling') return { state, error: 'Cannot score right now' }
  const turnId = currentPlayerId(state.session)
  if (turnId !== actorId) return { state, error: 'Not your turn' }
  if (state.session.rolls_this_turn < 1) return { state, error: 'Must roll at least once before scoring' }

  const card = state.scores[actorId]
  if (!card) return { state, error: 'Score card missing' }
  if (card.categories[category] != null) return { state, error: 'Category already used' }

  const dice = state.session.dice
  const bonusYahtzeeApplies = yahtzeeBonusEligible(dice, card.categories)
  const useJoker = jokerApplies(dice, card.categories) && category !== 'yahtzee'
  const score = categoryScore(dice, category, { joker: useJoker })

  const nextCategories: YahtzeeCategoryPoints = { ...card.categories, [category]: score }
  const nextCard: YahtzeeSoloScoreCard = {
    categories: nextCategories,
    bonusYahtzees: card.bonusYahtzees + (bonusYahtzeeApplies ? 1 : 0),
    jokerUsed: card.jokerUsed || useJoker,
  }
  const nextScores = { ...state.scores, [actorId]: nextCard }

  const name = NAMES[actorId] ?? 'Player'
  const logLine = `${name} scored ${score} on ${category}${bonusYahtzeeApplies ? ' (+100 Yahtzee bonus)' : ''}`

  // End-of-game check
  if (allCardsFull(nextScores)) {
    const outcome = outcomeFromScores(nextScores)
    const winnerId = outcome === 'human' ? YAHTZEE_SOLO_HUMAN_ID : outcome === 'bot' ? YAHTZEE_SOLO_BOT_ID : null
    const session: YahtzeeSession = {
      ...state.session,
      phase: 'finished',
      rolls_remaining: 0,
      rolls_this_turn: 0,
      winner_player_id: winnerId,
      status_message: outcome === 'draw' ? 'Draw — every category filled.' : `${NAMES[winnerId ?? '']} wins!`,
    }
    return {
      state: {
        ...state,
        session,
        scores: nextScores,
        outcome,
        log: appendLog(state.log, `${logLine} — game over`),
      },
    }
  }

  // Advance turn — skip past any player whose card is full (won't matter in
  // solo since both cards fill simultaneously, but keeps the logic symmetric).
  let idx = nextTurnIndex(state.session)
  for (let guard = 0; guard < state.session.turn_order.length; guard += 1) {
    const nextId = state.session.turn_order[idx]!
    if (hasAnyUnusedCategory(nextScores[nextId]!.categories)) break
    idx = (idx + 1) % state.session.turn_order.length
  }
  const nextName = NAMES[state.session.turn_order[idx] ?? ''] ?? 'Player'
  const session: YahtzeeSession = {
    ...state.session,
    current_turn_index: idx,
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    rolls_remaining: YAHTZEE_ROLLS_PER_TURN,
    rolls_this_turn: 0,
    status_message: `${logLine}. ${nextName}'s turn — roll to start.`,
  }
  return {
    state: {
      ...state,
      session,
      scores: nextScores,
      log: appendLog(state.log, logLine),
    },
  }
}

// ── Convenience: list of unfilled categories for the current player ──────────

export function unfilledCategoriesFor(state: YahtzeeSoloState, playerId: string): YahtzeeCategory[] {
  const card = state.scores[playerId]
  if (!card) return []
  return YAHTZEE_ALL_CATEGORIES.filter((c) => card.categories[c] == null)
}

/** Total score for a player (base + upper bonus + bonus Yahtzees). */
export function yahtzeeSoloTotal(state: YahtzeeSoloState, playerId: string): number {
  const card = state.scores[playerId]
  if (!card) return 0
  return totalScore(card.categories, card.bonusYahtzees)
}
