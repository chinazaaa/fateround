/**
 * Whot — solo (vs-bot) pure state machine.
 *
 * Mirrors the DB engine in `whot.ts` closely enough to be interchangeable at the
 * `WhotSession` / `WhotPlayerHand` boundary, but with NO Supabase, NO CAS, NO
 * async, and NO tables. State lives entirely in memory and is safe to serialize
 * to sessionStorage for a reload survivor.
 *
 * Why a parallel engine, not a wrapper around processWhotPlay:
 *   - Every one of the DB engine's async functions loads state, does one atomic
 *     write, and returns. To reuse them without Supabase would mean writing a
 *     fake SupabaseClient and mocking eight queries per move — for no benefit.
 *   - The pure primitives (canPlayCard, applyPickStacksAfterPlay, whotNextTurnIndex,
 *     hasPlayableCard, buildWhotDeck, parseWhotRules) are already exported. This
 *     module composes them.
 *   - The play/draw/choose paths in whot.ts weave in trophy stats, per-hand
 *     stats folding, race-loss handling, timers and General Market — all of which
 *     mean nothing in solo. Duplicating the small subset we DO need (~150 lines)
 *     keeps solo's blast radius zero and the DB engine untouched.
 *
 * The bot itself lives in `whot-bot.ts`; this file is bot-agnostic and models
 * both players symmetrically as seat indices 0 (human) and 1 (bot).
 */

import type { WhotCard, WhotShape, WhotSession, WhotPhase } from '@/types'
import {
  buildWhotDeck,
  canPlayCard,
  dealCount,
  hasPlayableCard,
  parseWhotRules,
  applyPickStacksAfterPlay,
  getNormalizedPickStacks,
  whotNextTurnIndex,
  whotHandSum,
  type WhotRules,
} from '@/lib/whot'

// ── Types ────────────────────────────────────────────────────────────────────

/** Which seat won an ended game, or 'draw' when both hands are equal on the buzzer. */
export type SoloWhotOutcome = 0 | 1 | 'draw' | null

export type SoloWhotState = {
  /** Symmetric session — reuses `WhotSession` so `canPlayCard` etc. work directly. */
  session: WhotSession
  /** Hand per seat, indexed to match session.turn_order (['player0', 'player1']). */
  hands: [WhotCard[], WhotCard[]]
  rules: WhotRules
  /** Human-readable feed of the last several events, newest last. */
  log: string[]
  outcome: SoloWhotOutcome
  /** How many game seconds elapsed for score purposes (client-driven). */
  startedAt: number
}

export type SoloWhotAction =
  | { type: 'play'; cardId: string }
  | { type: 'draw' }
  | { type: 'choose_shape'; shape: WhotShape }
  | { type: 'choose_number'; n: number }

// Two stable seat ids so the reused WhotSession helpers behave normally.
export const SOLO_HUMAN_ID = 'player0'
export const SOLO_BOT_ID = 'player1'
const TURN_ORDER: readonly [string, string] = [SOLO_HUMAN_ID, SOLO_BOT_ID]

const NAMES: Record<string, string> = { [SOLO_HUMAN_ID]: 'You', [SOLO_BOT_ID]: 'Bot' }
const LOG_LIMIT = 12

// ── Deck + starter selection ────────────────────────────────────────────────

/** Fisher–Yates shuffle. Injected RNG so tests are deterministic. */
function shuffle<T>(input: readonly T[], rng: () => number): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

/**
 * Which special numbers can't sit face-up as the starter card. Mirrors
 * `starterSpecials` in whot.ts (which is unexported, so kept in sync here):
 * Hold, Pick2, Pick3, Skip, General Market and WHOT all skew the very first
 * turn in ways the classic rules avoid.
 */
function starterSpecialsSet(rules: WhotRules): Set<number> {
  const specials = new Set<number>([1, 2, 8, 14, 20])
  if (rules.pick3Enabled) specials.add(5)
  return specials
}

/** Draw a plain (non-special) top card from the pile. Never mutates the input. */
function drawStarter(pile: WhotCard[], rules: WhotRules): { top: WhotCard; rest: WhotCard[] } {
  const specials = starterSpecialsSet(rules)
  const rest = [...pile]
  while (rest.length > 0) {
    const top = rest.pop()!
    if (!specials.has(top.number)) return { top, rest }
    // No plain card at the tail — rotate and keep looking.
    rest.unshift(top)
  }
  const top = rest.pop()!
  return { top, rest }
}

// ── Init ────────────────────────────────────────────────────────────────────

export type SoloWhotInitOptions = {
  rules?: WhotRules
  /** Deterministic random. Defaults to Math.random. */
  rng?: () => number
  /** Which seat leads. Defaults to the human. */
  first?: 0 | 1
  /** For score reporting; not read by the engine otherwise. */
  now?: number
}

export function initSoloWhot(opts: SoloWhotInitOptions = {}): SoloWhotState {
  const rules = opts.rules ?? parseWhotRules(null)
  const rng = opts.rng ?? Math.random
  const first = opts.first ?? 0

  const deck = shuffle(buildWhotDeck(rules), rng)
  const cardsEach = dealCount(2)

  const hands: [WhotCard[], WhotCard[]] = [[], []]
  let drawPile = [...deck]
  for (let c = 0; c < cardsEach; c += 1) {
    for (let p = 0; p < 2; p += 1) {
      const card = drawPile.pop()
      if (card) hands[p]!.push(card)
    }
  }

  const { top, rest } = drawStarter(drawPile, rules)
  drawPile = rest

  const session: WhotSession = {
    id: 'solo',
    game_id: 'solo',
    turn_order: [...TURN_ORDER],
    current_turn_index: first,
    phase: 'playing' as WhotPhase,
    draw_pile: drawPile,
    discard_pile: [],
    top_card: top,
    required_shape: null,
    required_number: null,
    pick_two_stack: 0,
    pick_five_stack: 0,
    status_message: null,
    winner_player_id: null,
    finish_order: [],
    reshuffle_count: 0,
    turn_deadline_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  }

  return {
    session,
    hands,
    rules,
    log: [`${NAMES[TURN_ORDER[first]!]} to lead — top card is ${top.shape} ${top.number}`],
    outcome: null,
    startedAt: opts.now ?? 0,
  }
}

// ── Small helpers ───────────────────────────────────────────────────────────

function log(state: SoloWhotState, line: string): SoloWhotState {
  const next = [...state.log, line].slice(-LOG_LIMIT)
  return { ...state, log: next }
}

function playerHand(state: SoloWhotState, playerIdx: 0 | 1): WhotCard[] {
  return state.hands[playerIdx]
}

function otherIdx(idx: 0 | 1): 0 | 1 {
  return idx === 0 ? 1 : 0
}

function currentPlayerIdx(state: SoloWhotState): 0 | 1 {
  return (state.session.current_turn_index as 0 | 1) ?? 0
}

/** Refill the draw pile from the (shuffled) discard when it empties. */
function refill(pile: WhotCard[], discard: WhotCard[], rng: () => number): { pile: WhotCard[]; discard: WhotCard[] } {
  if (pile.length > 0 || discard.length === 0) return { pile, discard }
  return { pile: shuffle(discard, rng), discard: [] }
}

/** Draw `count` cards, refilling from discard once if the pile empties. */
function drawWithRefill(
  pile: WhotCard[],
  discard: WhotCard[],
  count: number,
  rng: () => number
): { drawn: WhotCard[]; pile: WhotCard[]; discard: WhotCard[]; reshuffled: boolean } {
  let p = [...pile]
  let d = [...discard]
  let reshuffled = false
  const drawn: WhotCard[] = []
  for (let i = 0; i < count; i += 1) {
    if (p.length === 0) {
      const refilled = refill(p, d, rng)
      if (refilled.pile !== p) reshuffled = true
      p = refilled.pile
      d = refilled.discard
    }
    if (p.length === 0) break
    drawn.push(p.pop()!)
  }
  return { drawn, pile: p, discard: d, reshuffled }
}

/**
 * When a card is played the previous top card joins the discard pile. Mirrors
 * `discardPlayedTop` in whot.ts.
 */
function discardTop(session: WhotSession): WhotCard[] {
  const prev = session.top_card
  if (!prev) return session.discard_pile
  return [...session.discard_pile, prev]
}

// ── Terminal check ──────────────────────────────────────────────────────────

/** Finish when either seat has emptied their hand. */
function checkWin(state: SoloWhotState): SoloWhotState {
  if (state.hands[0].length === 0 || state.hands[1].length === 0) {
    const winner: SoloWhotOutcome = state.hands[0].length === 0 ? 0 : 1
    return {
      ...state,
      outcome: winner,
      session: {
        ...state.session,
        phase: 'finished',
        winner_player_id: TURN_ORDER[winner],
        finish_order: [TURN_ORDER[winner]!],
      },
    }
  }
  return state
}

// ── Actions ─────────────────────────────────────────────────────────────────

export type SoloWhotStepResult = { state: SoloWhotState; error?: string }

/** The seat is expected to play now (not choose shape/number after a WHOT). */
function requirePlayingPhase(state: SoloWhotState, playerIdx: 0 | 1): string | null {
  if (state.outcome != null) return 'Game is finished'
  if (state.session.phase === 'choose_whot') return 'Choose WHOT shape or number first'
  if (currentPlayerIdx(state) !== playerIdx) return 'Not your turn'
  return null
}

/**
 * Play `cardId` from `playerIdx`'s hand.
 *
 * Handles the four special-card families:
 *   1 Hold / 14 General Market → same player plays again
 *   8 Skip → next-of-next takes the turn
 *   2 Pick 2 / 5 Pick 3 → stack a penalty on the opposite seat
 *   20 WHOT → pause for the shape/number choice (unless it's the last card)
 */
export function soloPlay(
  state: SoloWhotState,
  playerIdx: 0 | 1,
  cardId: string,
  rng: () => number
): SoloWhotStepResult {
  const gate = requirePlayingPhase(state, playerIdx)
  if (gate) return { state, error: gate }

  const hand = playerHand(state, playerIdx)
  const idx = hand.findIndex((c) => c.id === cardId)
  if (idx < 0) return { state, error: 'Card not in hand' }
  const card = hand[idx]!

  // Legality gate: pick-stack rules first (they are stricter than plain match), then
  // the general shape/number match via the shared helper.
  const { pickTwo, pickFive } = getNormalizedPickStacks(state.session)
  if (pickTwo > 0 && !(state.rules.pick2Stacking && card.number === 2)) {
    return {
      state,
      error: state.rules.pick2Stacking ? 'Pick 2 active — play a 2 or draw' : 'Pick 2 active — draw the penalty',
    }
  }
  if (state.rules.pick3Enabled && pickFive > 0 && card.number !== 5) {
    return { state, error: 'Pick 3 active — play a 5 or draw' }
  }
  if (!canPlayCard(card, state.session, state.rules)) return { state, error: 'Cannot play that card' }

  const newHand = hand.filter((_, i) => i !== idx)
  const nextHands: [WhotCard[], WhotCard[]] = [...state.hands] as [WhotCard[], WhotCard[]]
  nextHands[playerIdx] = newHand
  const wentOut = newHand.length === 0

  const stacks = applyPickStacksAfterPlay(
    card.number,
    state.session.pick_two_stack ?? 0,
    state.session.pick_five_stack ?? 0,
    state.rules
  )

  // WHOT played with cards still in hand → pause; require the caller to choose.
  if (card.number === 20 && !wentOut) {
    const nextSession: WhotSession = {
      ...state.session,
      top_card: card,
      discard_pile: discardTop(state.session),
      required_shape: null,
      required_number: null,
      pick_two_stack: stacks.pickTwo,
      pick_five_stack: stacks.pickFive,
      phase: 'choose_whot',
    }
    return {
      state: log(
        { ...state, session: nextSession, hands: nextHands },
        `${NAMES[TURN_ORDER[playerIdx]!]} played WHOT — choosing…`
      ),
    }
  }

  // General Market (14): every other player draws one. Two-seat game → just the opponent.
  let drawPile = state.session.draw_pile
  let discardPile = discardTop(state.session)
  let marketNote: string | null = null
  if (card.number === 14) {
    const opp = otherIdx(playerIdx)
    const drawRes = drawWithRefill(drawPile, discardPile, 1, rng)
    drawPile = drawRes.pile
    discardPile = drawRes.discard
    if (drawRes.drawn.length > 0) {
      nextHands[opp] = [...nextHands[opp], ...drawRes.drawn]
      marketNote = `${NAMES[TURN_ORDER[opp]!]} drew 1 (General Market)`
    } else {
      marketNote = 'General Market — deck empty, nobody drew'
    }
  }

  // Turn advance:
  //   1, 14 → same seat plays again (hold-on)
  //   8    → skip: two steps forward, which in 2-player equals staying (skips opponent)
  //   else → other seat
  let nextIndex: number
  if (card.number === 1 || card.number === 14) {
    nextIndex = playerIdx
  } else if (card.number === 8) {
    // whotNextTurnIndex with steps=2 handles "skip past a zero-hand seat" correctly.
    nextIndex = whotNextTurnIndex(
      { ...state.session, turn_order: [...TURN_ORDER] },
      nextHands.map((cards, i) => ({
        id: `h${i}`,
        game_id: 'solo',
        player_id: TURN_ORDER[i]!,
        cards,
        player_order: i,
        created_at: '',
      })),
      state.session.current_turn_index,
      2
    )
  } else {
    nextIndex = otherIdx(playerIdx)
  }

  const nextSession: WhotSession = {
    ...state.session,
    top_card: card,
    required_shape: null,
    required_number: null,
    pick_two_stack: stacks.pickTwo,
    pick_five_stack: stacks.pickFive,
    draw_pile: drawPile,
    discard_pile: discardPile,
    current_turn_index: nextIndex,
    phase: wentOut ? 'finished' : 'playing',
    winner_player_id: wentOut ? TURN_ORDER[playerIdx] : null,
    finish_order: wentOut ? [TURN_ORDER[playerIdx]!] : state.session.finish_order,
  }

  const noteParts: string[] = [`${NAMES[TURN_ORDER[playerIdx]!]} played ${card.shape} ${card.number}`]
  if (marketNote) noteParts.push(marketNote)
  if (card.number === 2) noteParts.push(`Pick 2 stack → ${stacks.pickTwo}`)
  else if (card.number === 5 && state.rules.pick3Enabled) noteParts.push(`Pick 3 stack → ${stacks.pickFive}`)
  else if (card.number === 8) noteParts.push('Skip')

  let next: SoloWhotState = log({ ...state, session: nextSession, hands: nextHands }, noteParts.join(' · '))
  next = checkWin(next)
  return { state: next }
}

/**
 * Draw a card (or the full penalty). Passes the turn on unless there was nothing
 * to draw (empty pile+discard) AND nothing playable, in which case the game ends
 * by lowest hand — matching the DB engine's `finishWhotByLowestHand` path.
 */
export function soloDraw(state: SoloWhotState, playerIdx: 0 | 1, rng: () => number): SoloWhotStepResult {
  const gate = requirePlayingPhase(state, playerIdx)
  if (gate) return { state, error: gate }

  const { pickTwo, pickFive } = getNormalizedPickStacks(state.session)
  const penalty = pickTwo > 0 ? pickTwo : pickFive > 0 ? pickFive : 0
  const count = penalty > 0 ? penalty : 1

  const drawRes = drawWithRefill(state.session.draw_pile, state.session.discard_pile, count, rng)
  const hand = playerHand(state, playerIdx)

  // Both piles empty:
  //   - If this seat can still play, tell them (matches DB engine).
  //   - Otherwise, end by lowest-hand-sum: whoever has fewer points wins.
  if (drawRes.drawn.length === 0) {
    if (hasPlayableCard(hand, state.session, state.rules)) {
      return { state, error: 'Draw pile is empty — play a card from your hand' }
    }
    const sums: [number, number] = [whotHandSum(state.hands[0]), whotHandSum(state.hands[1])]
    const winner: SoloWhotOutcome = sums[0] === sums[1] ? 'draw' : sums[0] < sums[1] ? 0 : 1
    return {
      state: log(
        {
          ...state,
          outcome: winner,
          session: {
            ...state.session,
            phase: 'finished',
            winner_player_id: typeof winner === 'number' ? TURN_ORDER[winner] : null,
            finish_order: typeof winner === 'number' ? [TURN_ORDER[winner]!] : [],
          },
        },
        `Deck empty — ${winner === 'draw' ? "it's a draw" : `${NAMES[TURN_ORDER[winner as 0 | 1]!]} wins on lowest hand`}`
      ),
    }
  }

  const nextHands: [WhotCard[], WhotCard[]] = [...state.hands] as [WhotCard[], WhotCard[]]
  nextHands[playerIdx] = [...hand, ...drawRes.drawn]

  const nextSession: WhotSession = {
    ...state.session,
    draw_pile: drawRes.pile,
    discard_pile: drawRes.discard,
    // Drawing satisfies the penalty and always passes the turn.
    pick_two_stack: 0,
    pick_five_stack: 0,
    current_turn_index: otherIdx(playerIdx),
  }

  const note =
    penalty > 0
      ? `${NAMES[TURN_ORDER[playerIdx]!]} drew ${drawRes.drawn.length} (${pickTwo > 0 ? 'Pick 2' : 'Pick 3'})`
      : `${NAMES[TURN_ORDER[playerIdx]!]} drew 1`

  return { state: log({ ...state, session: nextSession, hands: nextHands }, note) }
}

/**
 * After playing a WHOT: name the shape (always) or the number (if `numberCallsEnabled`)
 * the opponent must match.
 */
export function soloChooseShape(state: SoloWhotState, playerIdx: 0 | 1, shape: WhotShape): SoloWhotStepResult {
  if (state.session.phase !== 'choose_whot') return { state, error: 'Not choosing WHOT' }
  if (currentPlayerIdx(state) !== playerIdx) return { state, error: 'Not your turn' }
  if (shape === 'whot') return { state, error: 'Pick a real shape' }

  const nextSession: WhotSession = {
    ...state.session,
    required_shape: shape,
    required_number: null,
    phase: 'playing',
    current_turn_index: otherIdx(playerIdx),
  }
  return {
    state: log({ ...state, session: nextSession }, `${NAMES[TURN_ORDER[playerIdx]!]} called ${shape}`),
  }
}

export function soloChooseNumber(state: SoloWhotState, playerIdx: 0 | 1, n: number): SoloWhotStepResult {
  if (state.session.phase !== 'choose_whot') return { state, error: 'Not choosing WHOT' }
  if (currentPlayerIdx(state) !== playerIdx) return { state, error: 'Not your turn' }
  if (!state.rules.numberCallsEnabled) return { state, error: 'Number calls are disabled' }
  if (!Number.isInteger(n) || n < 1 || n > 14) return { state, error: 'Invalid number' }

  const nextSession: WhotSession = {
    ...state.session,
    required_shape: null,
    required_number: n,
    phase: 'playing',
    current_turn_index: otherIdx(playerIdx),
  }
  return {
    state: log({ ...state, session: nextSession }, `${NAMES[TURN_ORDER[playerIdx]!]} called number ${n}`),
  }
}
