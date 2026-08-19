/**
 * Crazy Eights — solo (vs-bot) pure state machine.
 *
 * Same design as `whot-solo.ts`: the DB engine in `crazy-eights.ts` is async
 * and Supabase-coupled, and its play/draw/choose paths weave in trophy stats
 * + atomic CAS that mean nothing solo. Rather than mock a SupabaseClient this
 * module composes the pure primitives (canPlayCard, hasPlayableCard,
 * crazyEightsNextTurnIndex, buildCrazyEightsDeck, parseCrazyEightsRules,
 * getNormalizedPenalties, isWildCard, isJoker) into a thin pure state machine.
 *
 * State is JSON-safe and mirrored to sessionStorage on the client so a reload
 * survives.
 *
 * The bot itself lives in `crazy-eights-bot.ts`; this file is bot-agnostic and
 * models both players symmetrically as seat indices 0 (human) and 1 (bot).
 */

import type { CrazyEightsCard, CrazyEightsCalledSuit, CrazyEightsPhase, CrazyEightsSession } from './types'
import {
  JOKER_DRAW,
  buildCrazyEightsDeck,
  canPlayCard,
  crazyEightsHandSum,
  crazyEightsNextTurnIndex,
  getNormalizedPenalties,
  hasPlayableCard,
  isJoker,
  isWildCard,
  parseCrazyEightsRules,
  type CrazyEightsRules,
} from './crazy-eights'

// ── Types ────────────────────────────────────────────────────────────────────

export type Crazy8SoloOutcome = 0 | 1 | 'draw' | null

export type Crazy8SoloState = {
  session: CrazyEightsSession
  /** Hand per seat, indexed to match session.turn_order (['player0', 'player1']). */
  hands: [CrazyEightsCard[], CrazyEightsCard[]]
  rules: CrazyEightsRules
  log: string[]
  outcome: Crazy8SoloOutcome
  startedAt: number
}

export type Crazy8SoloAction =
  | { type: 'play'; cardId: string }
  | { type: 'draw' }
  | { type: 'choose_suit'; suit: CrazyEightsCalledSuit }

export const CRAZY8_SOLO_HUMAN_ID = 'player0'
export const CRAZY8_SOLO_BOT_ID = 'player1'
const TURN_ORDER: readonly [string, string] = [CRAZY8_SOLO_HUMAN_ID, CRAZY8_SOLO_BOT_ID]

const NAMES: Record<string, string> = { [CRAZY8_SOLO_HUMAN_ID]: 'You', [CRAZY8_SOLO_BOT_ID]: 'Bot' }
const LOG_LIMIT = 12

// ── Deck / starter ──────────────────────────────────────────────────────────

/** Fisher–Yates with an injected RNG for deterministic tests. */
function shuffle<T>(input: readonly T[], rng: () => number): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

/**
 * Which cards can't be the starter face-up. Mirrors `isStarterSpecial` in
 * crazy-eights.ts (unexported), so kept in sync here: jokers, 8s, action
 * cards (2/A/J/Q) all skew the first turn and are avoided as the starter.
 */
function isStarterSpecial(card: CrazyEightsCard, rules: CrazyEightsRules): boolean {
  if (isJoker(card)) return true
  if (card.rank === 8) return true
  if (rules.actionCards && (card.rank === 2 || card.rank === 1 || card.rank === 11 || card.rank === 12)) return true
  return false
}

/** Draw a plain (non-special) starter from the pile. Never mutates the input. */
function drawStarter(
  pile: CrazyEightsCard[],
  rules: CrazyEightsRules
): { top: CrazyEightsCard; rest: CrazyEightsCard[] } {
  const rest = [...pile]
  while (rest.length > 0) {
    const top = rest.pop()!
    if (!isStarterSpecial(top, rules)) return { top, rest }
    rest.unshift(top)
  }
  const top = rest.pop()!
  return { top, rest }
}

// ── Init ────────────────────────────────────────────────────────────────────

export type Crazy8SoloInitOptions = {
  rules?: CrazyEightsRules
  rng?: () => number
  first?: 0 | 1
  now?: number
}

export function initCrazy8Solo(opts: Crazy8SoloInitOptions = {}): Crazy8SoloState {
  const rules = opts.rules ?? parseCrazyEightsRules(null)
  const rng = opts.rng ?? Math.random
  const first = opts.first ?? 0

  // Two-player deals 7 each; mirrors the engine's `dealCount(2)`.
  const cardsEach = 7
  const deck = shuffle(buildCrazyEightsDeck(rules), rng)

  const hands: [CrazyEightsCard[], CrazyEightsCard[]] = [[], []]
  let drawPile = [...deck]
  for (let c = 0; c < cardsEach; c += 1) {
    for (let p = 0; p < 2; p += 1) {
      const card = drawPile.pop()
      if (card) hands[p]!.push(card)
    }
  }

  const { top, rest } = drawStarter(drawPile, rules)
  drawPile = rest

  const session: CrazyEightsSession = {
    id: 'solo',
    game_id: 'solo',
    turn_order: [...TURN_ORDER],
    current_turn_index: first,
    direction: 1,
    phase: 'playing' as CrazyEightsPhase,
    draw_pile: drawPile,
    discard_pile: [],
    top_card: top,
    required_suit: null,
    pick_two_stack: 0,
    joker_penalty: 0,
    status_message: null,
    winner_player_id: null,
    finish_order: [],
    turn_deadline_at: null,
  }

  return {
    session,
    hands,
    rules,
    log: [`${NAMES[TURN_ORDER[first]!]} to lead — top card is ${top.suit} ${top.rank}`],
    outcome: null,
    startedAt: opts.now ?? 0,
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function log(state: Crazy8SoloState, line: string): Crazy8SoloState {
  return { ...state, log: [...state.log, line].slice(-LOG_LIMIT) }
}

function otherIdx(idx: 0 | 1): 0 | 1 {
  return idx === 0 ? 1 : 0
}

function currentPlayerIdx(state: Crazy8SoloState): 0 | 1 {
  return (state.session.current_turn_index as 0 | 1) ?? 0
}

/** Refill the draw pile from the (shuffled) discard when it empties. */
function refill(
  pile: CrazyEightsCard[],
  discard: CrazyEightsCard[],
  rng: () => number
): { pile: CrazyEightsCard[]; discard: CrazyEightsCard[] } {
  if (pile.length > 0 || discard.length === 0) return { pile, discard }
  return { pile: shuffle(discard, rng), discard: [] }
}

function drawWithRefill(
  pile: CrazyEightsCard[],
  discard: CrazyEightsCard[],
  count: number,
  rng: () => number
): { drawn: CrazyEightsCard[]; pile: CrazyEightsCard[]; discard: CrazyEightsCard[]; reshuffled: boolean } {
  let p = [...pile]
  let d = [...discard]
  let reshuffled = false
  const drawn: CrazyEightsCard[] = []
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

// Solo play never reads a session from Supabase — it builds one in memory — so the piles are
// always present here. The `?? []` only satisfies the optional type introduced when
// draw_pile/discard_pile were revoked from anon for multiplayer.
function discardTop(session: CrazyEightsSession): CrazyEightsCard[] {
  const prev = session.top_card
  if (!prev) return session.discard_pile ?? []
  return [...(session.discard_pile ?? []), prev]
}

/**
 * Turn advance:
 *   Queen (12)     → direction flips; in 2p that hands the turn back to the mover (skip)
 *   Ace (1) / Jack (11) → skip: 2 steps forward, which in 2p equals staying with mover
 *   else           → other seat
 * Wraps `crazyEightsNextTurnIndex` so the direction / skip logic matches the DB engine.
 */
function computeNextIndex(
  state: Crazy8SoloState,
  card: CrazyEightsCard,
  hands: [CrazyEightsCard[], CrazyEightsCard[]]
): { index: number; direction: number } {
  let direction = state.session.direction < 0 ? -1 : 1
  let steps = 1
  if (state.rules.actionCards) {
    if (card.rank === 12) {
      direction = -direction
    } else if (card.rank === 11 || card.rank === 1) {
      steps = 2
    }
  }
  // crazyEightsNextTurnIndex needs a hands array shaped like PlayerHand — build a
  // minimal one that matches the fields it reads.
  const handsForEngine = hands.map((cards, i) => ({
    id: `h${i}`,
    game_id: 'solo',
    player_id: TURN_ORDER[i]!,
    cards,
    player_order: i,
    created_at: '',
  }))
  const nextIndex = crazyEightsNextTurnIndex(
    { ...state.session, turn_order: [...TURN_ORDER] },
    handsForEngine,
    state.session.current_turn_index,
    steps,
    direction
  )
  return { index: nextIndex, direction }
}

// ── Terminal check ──────────────────────────────────────────────────────────

function checkWin(state: Crazy8SoloState): Crazy8SoloState {
  if (state.hands[0].length === 0 || state.hands[1].length === 0) {
    const winner: Crazy8SoloOutcome = state.hands[0].length === 0 ? 0 : 1
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

export type Crazy8SoloStepResult = { state: Crazy8SoloState; error?: string }

function requirePlayingPhase(state: Crazy8SoloState, playerIdx: 0 | 1): string | null {
  if (state.outcome != null) return 'Game is finished'
  if (state.session.phase === 'choose_suit') return 'Choose a suit first'
  if (currentPlayerIdx(state) !== playerIdx) return 'Not your turn'
  return null
}

/**
 * Play `cardId` from `playerIdx`'s hand.
 *
 * Handles the special-card families:
 *   Wild (8, Joker) → pause for the suit choice; Joker also leaves a 5-draw
 *                     penalty on the next player
 *   Pick 2 (rank 2) → stack a 2-card penalty (or add to an existing stack)
 *   Skip (A, J)     → advance 2 → same seat plays again in 2p
 *   Reverse (Q)     → flip direction → same as skip in 2p
 */
export function crazy8SoloPlay(
  state: Crazy8SoloState,
  playerIdx: 0 | 1,
  cardId: string,
  rng: () => number
): Crazy8SoloStepResult {
  const gate = requirePlayingPhase(state, playerIdx)
  if (gate) return { state, error: gate }

  const hand = state.hands[playerIdx]
  const idx = hand.findIndex((c) => c.id === cardId)
  if (idx < 0) return { state, error: 'Card not in hand' }
  const card = hand[idx]!

  // Penalty gate first (stricter than plain match), then plain legality.
  const { pickTwo, jokerPenalty } = getNormalizedPenalties(state.session)
  if (jokerPenalty > 0) return { state, error: `Joker — draw the ${jokerPenalty}-card penalty` }
  if (pickTwo > 0 && !(state.rules.actionCards && state.rules.pick2Stacking && card.rank === 2)) {
    return {
      state,
      error:
        state.rules.actionCards && state.rules.pick2Stacking
          ? 'Pick 2 active — play a 2 or draw'
          : 'Pick 2 active — draw the penalty',
    }
  }
  if (!canPlayCard(card, state.session, state.rules)) return { state, error: 'Cannot play that card' }

  const newHand = hand.filter((_, i) => i !== idx)
  const nextHands: [CrazyEightsCard[], CrazyEightsCard[]] = [...state.hands] as [CrazyEightsCard[], CrazyEightsCard[]]
  nextHands[playerIdx] = newHand
  const wentOut = newHand.length === 0

  // Pick 2 stacking: a 2 adds to (or opens) the stack; other cards leave it alone.
  const newPickTwo =
    state.rules.actionCards && card.rank === 2
      ? (state.session.pick_two_stack ?? 0) > 0
        ? (state.session.pick_two_stack ?? 0) + 2
        : 2
      : 0

  // Wild (8 or Joker) with cards left → pause for suit choice.
  if (isWildCard(card) && !wentOut) {
    const jokerLoad = isJoker(card) ? JOKER_DRAW : 0
    const nextSession: CrazyEightsSession = {
      ...state.session,
      top_card: card,
      discard_pile: discardTop(state.session),
      required_suit: null,
      pick_two_stack: 0,
      joker_penalty: jokerLoad,
      phase: 'choose_suit',
    }
    return {
      state: log(
        { ...state, session: nextSession, hands: nextHands },
        `${NAMES[TURN_ORDER[playerIdx]!]} played ${isJoker(card) ? 'a Joker' : 'a Crazy 8'} — choosing suit…`
      ),
    }
  }

  // Non-wild play (and wild-as-last-card, which wins immediately).
  const { index: nextIndex, direction } = computeNextIndex(state, card, nextHands)
  const nextSession: CrazyEightsSession = {
    ...state.session,
    top_card: card,
    required_suit: null,
    pick_two_stack: newPickTwo,
    joker_penalty: 0,
    discard_pile: discardTop(state.session),
    current_turn_index: nextIndex,
    direction,
    phase: wentOut ? 'finished' : 'playing',
    winner_player_id: wentOut ? TURN_ORDER[playerIdx] : null,
    finish_order: wentOut ? [TURN_ORDER[playerIdx]!] : state.session.finish_order,
  }

  const notes: string[] = [`${NAMES[TURN_ORDER[playerIdx]!]} played ${card.suit} ${card.rank}`]
  if (state.rules.actionCards && card.rank === 2) notes.push(`Pick 2 stack → ${newPickTwo}`)
  else if (state.rules.actionCards && (card.rank === 1 || card.rank === 11)) notes.push('Skip')
  else if (state.rules.actionCards && card.rank === 12) notes.push('Reverse')

  // avoid drawWithRefill "unused" warning — we don't refill on play, but the
  // helper is available to soloDraw below.
  void rng

  let next: Crazy8SoloState = log({ ...state, session: nextSession, hands: nextHands }, notes.join(' · '))
  next = checkWin(next)
  return { state: next }
}

/**
 * Draw a card (or the full penalty). Passes the turn on. If both piles are
 * empty AND nothing playable, ends by lowest-hand-sum — same policy the DB
 * engine's `finishByLowestHand` uses.
 */
export function crazy8SoloDraw(state: Crazy8SoloState, playerIdx: 0 | 1, rng: () => number): Crazy8SoloStepResult {
  const gate = requirePlayingPhase(state, playerIdx)
  if (gate) return { state, error: gate }

  const { pickTwo, jokerPenalty } = getNormalizedPenalties(state.session)
  const penalty = pickTwo > 0 ? pickTwo : jokerPenalty > 0 ? jokerPenalty : 0
  const count = penalty > 0 ? penalty : 1

  const drawRes = drawWithRefill(state.session.draw_pile ?? [], state.session.discard_pile ?? [], count, rng)
  const hand = state.hands[playerIdx]

  if (drawRes.drawn.length === 0) {
    if (hasPlayableCard(hand, state.session, state.rules)) {
      return { state, error: 'Draw pile is empty — play a card from your hand' }
    }
    const sums: [number, number] = [crazyEightsHandSum(state.hands[0]), crazyEightsHandSum(state.hands[1])]
    const winner: Crazy8SoloOutcome = sums[0] === sums[1] ? 'draw' : sums[0] < sums[1] ? 0 : 1
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

  const nextHands: [CrazyEightsCard[], CrazyEightsCard[]] = [...state.hands] as [CrazyEightsCard[], CrazyEightsCard[]]
  nextHands[playerIdx] = [...hand, ...drawRes.drawn]

  const nextSession: CrazyEightsSession = {
    ...state.session,
    draw_pile: drawRes.pile,
    discard_pile: drawRes.discard,
    // Drawing satisfies the penalty and always passes the turn.
    pick_two_stack: 0,
    joker_penalty: 0,
    current_turn_index: otherIdx(playerIdx),
  }

  const note =
    penalty > 0
      ? `${NAMES[TURN_ORDER[playerIdx]!]} drew ${drawRes.drawn.length} (${pickTwo > 0 ? 'Pick 2' : 'Joker'})`
      : `${NAMES[TURN_ORDER[playerIdx]!]} drew 1`

  return { state: log({ ...state, session: nextSession, hands: nextHands }, note) }
}

/**
 * After playing an 8 (or Joker): name the suit the opponent must match. This
 * also clears any pending Joker penalty from the pile onto the next player.
 */
export function crazy8SoloChooseSuit(
  state: Crazy8SoloState,
  playerIdx: 0 | 1,
  suit: CrazyEightsCalledSuit
): Crazy8SoloStepResult {
  if (state.session.phase !== 'choose_suit') return { state, error: 'Not choosing suit' }
  if (currentPlayerIdx(state) !== playerIdx) return { state, error: 'Not your turn' }

  const nextSession: CrazyEightsSession = {
    ...state.session,
    required_suit: suit,
    phase: 'playing',
    current_turn_index: otherIdx(playerIdx),
  }
  return {
    state: log({ ...state, session: nextSession }, `${NAMES[TURN_ORDER[playerIdx]!]} called ${suit}`),
  }
}
