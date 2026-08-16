/**
 * Ludo — solo (vs-bot) pure state machine.
 *
 * Mirrors the turn flow in the server route (see monopoly.ts's server handlers
 * for the same shape) using ludo.ts's pure entrypoints:
 *   - `rollLudoDice`         → produce a dice roll
 *   - `resolveLudoMovesForTurn` → derive legal moves for the current state
 *   - `applyMoveLocally`     → fold a chosen move into new player states
 *   - `ludoGrantsExtraRoll`, `allPiecesFinished` → turn / end-of-game
 *
 * No Supabase, no async, no timers, no realtime. State is safe to serialize
 * to sessionStorage so a page reload continues the same game.
 *
 * The bot lives in `ludo-bot.ts`; this file is bot-agnostic and models both
 * sides symmetrically. Solo runs 2 players, human=red, bot=blue.
 */

import type { LudoDiceRoll, LudoPlayerState, LudoSession, LudoVariant } from '@/types'
import {
  LUDO_DEFAULT_VARIANT,
  allPiecesFinished,
  applyMoveLocally,
  createInitialPieces,
  getLegalMovesFromRemaining,
  ludoGrantsExtraRoll,
  resolveLudoMovesForTurn,
  rollLudoDice,
  type LudoMoveOption,
} from '@/lib/ludo'

// ── Types ────────────────────────────────────────────────────────────────────

export type LudoSoloOutcome = 'human' | 'bot' | null

export type LudoSoloState = {
  /** Symmetric session — reuses LudoSession so LudoGamePanel works unchanged. */
  session: LudoSession
  states: LudoPlayerState[]
  variant: LudoVariant
  outcome: LudoSoloOutcome
  /** Human-readable feed of the last several events, newest last. */
  log: string[]
}

export type LudoSoloStepResult = { state: LudoSoloState; error?: string }

export const LUDO_SOLO_HUMAN_ID = 'player_a'
export const LUDO_SOLO_BOT_ID = 'player_b'
const LOG_LIMIT = 12
const NAMES: Record<string, string> = { [LUDO_SOLO_HUMAN_ID]: 'You', [LUDO_SOLO_BOT_ID]: 'Bot' }

// ── Init ─────────────────────────────────────────────────────────────────────

/**
 * Fresh 2-player solo session: human (red) vs bot (blue). Human always goes
 * first — a coin-flip would surprise more than it delights in a practice mode.
 */
export function initLudoSolo(variant: LudoVariant = LUDO_DEFAULT_VARIANT): LudoSoloState {
  const now = new Date(0).toISOString() // deterministic; sessionStorage-safe
  const session: LudoSession = {
    id: 'solo',
    game_id: 'solo',
    turn_order: [LUDO_SOLO_HUMAN_ID, LUDO_SOLO_BOT_ID],
    current_turn_index: 0,
    phase: 'roll',
    last_dice: null,
    remaining_dice: null,
    consecutive_sixes: 0,
    extra_turn: false,
    status_message: 'Your turn — roll the dice',
    winner_player_id: null,
    turn_deadline_at: null,
    created_at: now,
    updated_at: now,
  }
  const states: LudoPlayerState[] = [
    {
      id: 'state-human',
      game_id: 'solo',
      player_id: LUDO_SOLO_HUMAN_ID,
      color: 'red',
      pieces: createInitialPieces(),
      player_order: 0,
      created_at: now,
    },
    {
      id: 'state-bot',
      game_id: 'solo',
      player_id: LUDO_SOLO_BOT_ID,
      color: 'blue',
      pieces: createInitialPieces(),
      player_order: 1,
      created_at: now,
    },
  ]
  return { session, states, variant, outcome: null, log: [] }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function currentPlayerId(session: LudoSession): string {
  return session.turn_order[session.current_turn_index] ?? LUDO_SOLO_HUMAN_ID
}

function nextTurnIndex(session: LudoSession): number {
  return (session.current_turn_index + 1) % session.turn_order.length
}

function appendLog(log: string[], line: string): string[] {
  const next = [...log, line]
  return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next
}

function stateFor(states: LudoPlayerState[], playerId: string): LudoPlayerState | undefined {
  return states.find((s) => s.player_id === playerId)
}

// ── Roll ─────────────────────────────────────────────────────────────────────

/**
 * Roll the dice for the current player. On a legal-move-producing roll we
 * enter `move` phase with the die values in `remaining_dice`. On a dud (no
 * legal moves) we auto-advance the turn — same as the server route.
 *
 * `presetDice` is a test-only injection point so unit tests can pin the roll.
 */
export function rollLudoSolo(state: LudoSoloState, actorId: string, presetDice?: LudoDiceRoll): LudoSoloStepResult {
  if (state.outcome != null) return { state, error: 'Game finished' }
  if (state.session.phase !== 'roll') return { state, error: 'Not in roll phase' }
  const turnId = currentPlayerId(state.session)
  if (turnId !== actorId) return { state, error: 'Not your turn' }

  const dice = presetDice ?? rollLudoDice()
  const remainingDice = [dice.d1, dice.d2]
  const playerState = stateFor(state.states, actorId)
  if (!playerState) return { state, error: 'Player state missing' }

  const legalMoves = getLegalMovesFromRemaining(
    playerState.color,
    playerState.pieces,
    remainingDice,
    state.states,
    actorId,
    state.variant
  )

  const name = NAMES[actorId] ?? 'Player'
  const rollLine = `${name} rolled ${dice.d1} + ${dice.d2}`

  if (legalMoves.length === 0) {
    // No legal move — advance the turn straight away, resetting the six-streak.
    const grantsExtra = ludoGrantsExtraRoll(dice)
    // A "no legal move on a 6" still consumes the extra-roll bonus per real
    // Ludo — three sixes in a row = lost turn, but here we have a fresh single
    // roll; simply drop consecutive_sixes and pass the turn.
    const currentTurnIndex = nextTurnIndex(state.session)
    const nextName = NAMES[state.session.turn_order[currentTurnIndex] ?? ''] ?? 'Player'
    const session: LudoSession = {
      ...state.session,
      current_turn_index: currentTurnIndex,
      phase: 'roll',
      last_dice: dice,
      remaining_dice: null,
      consecutive_sixes: grantsExtra ? state.session.consecutive_sixes : 0,
      extra_turn: false,
      status_message: `${name} rolled ${dice.d1} + ${dice.d2} — no legal move. ${nextName}'s turn`,
    }
    return {
      state: {
        ...state,
        session,
        log: appendLog(state.log, `${rollLine} — no legal move, turn passes`),
      },
    }
  }

  const session: LudoSession = {
    ...state.session,
    phase: 'move',
    last_dice: dice,
    remaining_dice: remainingDice,
    status_message: `${name} rolled ${dice.d1} + ${dice.d2} — pick a piece to move`,
  }
  return { state: { ...state, session, log: appendLog(state.log, rollLine) } }
}

// ── Move ─────────────────────────────────────────────────────────────────────

/**
 * Apply a chosen move for the current player. Mirrors the server route's
 * flow: apply, consume the die (or all dice if usesAllDice), then decide
 * whether the current player rolls again (remaining dice with legal moves,
 * or extra-roll bonus for a 6) or the turn passes.
 */
export function applyLudoSoloMove(state: LudoSoloState, actorId: string, move: LudoMoveOption): LudoSoloStepResult {
  if (state.outcome != null) return { state, error: 'Game finished' }
  if (state.session.phase !== 'move') return { state, error: 'Not in move phase' }
  const turnId = currentPlayerId(state.session)
  if (turnId !== actorId) return { state, error: 'Not your turn' }

  const playerState = stateFor(state.states, actorId)
  if (!playerState) return { state, error: 'Player state missing' }

  const nextStates = applyMoveLocally(state.states, actorId, move, playerState.color, state.variant)
  const myPieces = stateFor(nextStates, actorId)?.pieces ?? []
  const won = allPiecesFinished(myPieces)

  const remainingBefore = state.session.remaining_dice ?? []
  const remainingAfter = move.usesAllDice ? [] : remainingBefore.filter((_, i) => i !== move.diceIndex)

  const name = NAMES[actorId] ?? 'Player'
  const didCapture = move.captures
  const moveNote = didCapture
    ? `${name} captured!`
    : move.to.zone === 'finished'
      ? `${name} finished a piece`
      : move.from.zone === 'base' && move.to.zone === 'track'
        ? `${name} left base`
        : `${name} moved ${move.diceValue}`

  if (won) {
    const outcome: LudoSoloOutcome = actorId === LUDO_SOLO_HUMAN_ID ? 'human' : 'bot'
    const session: LudoSession = {
      ...state.session,
      phase: 'finished',
      remaining_dice: null,
      extra_turn: false,
      winner_player_id: actorId,
      status_message: `${name} wins!`,
    }
    return {
      state: {
        ...state,
        session,
        states: nextStates,
        outcome,
        log: appendLog(state.log, `${moveNote} — game over`),
      },
    }
  }

  const roll = state.session.last_dice
  const grantsExtra = roll != null && ludoGrantsExtraRoll(roll)

  // Case A: more dice to spend AND at least one still has a legal move
  if (remainingAfter.length > 0) {
    const followUp = getLegalMovesFromRemaining(
      playerState.color,
      myPieces,
      remainingAfter,
      nextStates,
      actorId,
      state.variant
    )
    if (followUp.length > 0) {
      const session: LudoSession = {
        ...state.session,
        remaining_dice: remainingAfter,
        status_message: `${moveNote} — use ${remainingAfter.join(' + ')} next`,
      }
      return {
        state: { ...state, session, states: nextStates, log: appendLog(state.log, moveNote) },
      }
    }
    // Remaining dice but nothing legal to do with them — fall through to
    // end-of-turn logic (same as if remaining were empty).
  }

  // Case B: all dice spent (or no legal follow-up) — decide extra roll vs pass.
  const consecutiveSixes = grantsExtra ? state.session.consecutive_sixes + 1 : 0
  const forfeitOnTripleSix = consecutiveSixes >= 3

  if (grantsExtra && !forfeitOnTripleSix) {
    const session: LudoSession = {
      ...state.session,
      phase: 'roll',
      last_dice: null,
      remaining_dice: null,
      consecutive_sixes: consecutiveSixes,
      extra_turn: true,
      status_message: `${moveNote} — rolled a six, roll again!`,
    }
    return {
      state: {
        ...state,
        session,
        states: nextStates,
        log: appendLog(state.log, `${moveNote} — bonus roll`),
      },
    }
  }

  const currentTurnIndex = nextTurnIndex(state.session)
  const nextName = NAMES[state.session.turn_order[currentTurnIndex] ?? ''] ?? 'Player'
  const session: LudoSession = {
    ...state.session,
    current_turn_index: currentTurnIndex,
    phase: 'roll',
    last_dice: null,
    remaining_dice: null,
    consecutive_sixes: 0,
    extra_turn: false,
    status_message: forfeitOnTripleSix
      ? `Three sixes in a row — turn lost. ${nextName}'s turn`
      : `${moveNote}. ${nextName}'s turn`,
  }
  return {
    state: {
      ...state,
      session,
      states: nextStates,
      log: appendLog(state.log, forfeitOnTripleSix ? 'Triple sixes — turn lost' : moveNote),
    },
  }
}

// ── Convenience: legal-moves accessor for the bot ────────────────────────────

/**
 * Legal moves for the current turn holder. Empty when it's not their move
 * phase, or when they hold the turn but have nothing legal (in which case
 * the caller should roll — the state machine will auto-pass if needed).
 */
export function legalMovesForCurrentPlayer(state: LudoSoloState): LudoMoveOption[] {
  if (state.session.phase !== 'move') return []
  const turnId = currentPlayerId(state.session)
  const playerState = stateFor(state.states, turnId)
  const remaining = state.session.remaining_dice ?? []
  if (!playerState || remaining.length === 0) return []
  return resolveLudoMovesForTurn(playerState.color, playerState.pieces, remaining, state.states, turnId, state.variant)
}
