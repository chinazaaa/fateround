/**
 * UNO — solo (vs-bot) pure state machine.
 *
 * Same design as `whot-solo.ts` and `crazy-eights-solo.ts`. The DB engine in
 * `uno.ts` supports many optional rule modules — Team-Up, Jump-In, Zero-Seven,
 * Multi-Play, WD4 challenge, UNO-call penalty, No Mercy — and layers atomic CAS
 * + trophy stats + realtime broadcasts on every path.
 *
 * Solo strips it to CLASSIC UNO ONLY:
 *   - Number cards 0-9 match by colour or value
 *   - Skip / Reverse / Draw 2 as action cards
 *   - Wild and Wild Draw 4 (auto-accept, no challenge — challenges are a social
 *     rule that doesn't translate to a bot opponent well)
 *   - Drawing 1 card always passes the turn (real UNO gives you the option to
 *     play the drawn card; solo skips this to keep the state machine tight)
 *   - No Multi-Play, no Zero-Seven swap, no Jump-In, no Team-Up, no UNO-call
 *     penalty, no No Mercy
 *
 * That's plenty for a "practice a game vs a bot" mode. The DB engine remains
 * the full-fat implementation for multiplayer rooms.
 *
 * The bot lives in `uno-bot.ts`; this file is bot-agnostic and models both
 * players symmetrically as seat indices 0 (human) and 1 (bot).
 */

import type { UnoCard, UnoColor, UnoPhase, UnoSession } from '@/types'
import {
  buildUnoDeck,
  canPlayCard as canPlayCardEngine,
  cardPoints,
  hasPlayableCard,
  isWildCard,
  unoHandSum,
} from '@/lib/uno'

// ── Types ────────────────────────────────────────────────────────────────────

export type UnoSoloOutcome = 0 | 1 | 'draw' | null

export type UnoSoloState = {
  session: UnoSession
  /** Hand per seat, indexed to match session.turn_order (['player0', 'player1']). */
  hands: [UnoCard[], UnoCard[]]
  log: string[]
  outcome: UnoSoloOutcome
  startedAt: number
}

export type UnoSoloAction =
  | { type: 'play'; cardId: string }
  | { type: 'draw' }
  | { type: 'choose_color'; color: UnoColor }

export const UNO_SOLO_HUMAN_ID = 'player0'
export const UNO_SOLO_BOT_ID = 'player1'
const TURN_ORDER: readonly [string, string] = [UNO_SOLO_HUMAN_ID, UNO_SOLO_BOT_ID]

const NAMES: Record<string, string> = { [UNO_SOLO_HUMAN_ID]: 'You', [UNO_SOLO_BOT_ID]: 'Bot' }
const LOG_LIMIT = 12
const DEAL_COUNT = 7

// ── Deck / starter ──────────────────────────────────────────────────────────

function shuffle<T>(input: readonly T[], rng: () => number): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

/**
 * Which cards can't start face-up. Wilds and action cards all skew the first
 * turn, so we roll them under the pile and keep looking for a plain number.
 */
function isStarterSpecial(card: UnoCard): boolean {
  if (isWildCard(card)) return true
  if (card.kind !== 'number') return true
  return false
}

function drawStarter(pile: UnoCard[]): { top: UnoCard; rest: UnoCard[] } {
  const rest = [...pile]
  while (rest.length > 0) {
    const top = rest.pop()!
    if (!isStarterSpecial(top)) return { top, rest }
    rest.unshift(top)
  }
  const top = rest.pop()!
  return { top, rest }
}

// ── Init ────────────────────────────────────────────────────────────────────

export type UnoSoloInitOptions = {
  rng?: () => number
  first?: 0 | 1
  now?: number
}

export function initUnoSolo(opts: UnoSoloInitOptions = {}): UnoSoloState {
  const rng = opts.rng ?? Math.random
  const first = opts.first ?? 0

  const deck = shuffle(buildUnoDeck(), rng)
  const hands: [UnoCard[], UnoCard[]] = [[], []]
  let drawPile = [...deck]
  for (let c = 0; c < DEAL_COUNT; c += 1) {
    for (let p = 0; p < 2; p += 1) {
      const card = drawPile.pop()
      if (card) hands[p]!.push(card)
    }
  }

  const { top, rest } = drawStarter(drawPile)
  drawPile = rest

  const session: UnoSession = {
    id: 'solo',
    game_id: 'solo',
    turn_order: [...TURN_ORDER],
    current_turn_index: first,
    direction: 1,
    phase: 'playing' as UnoPhase,
    draw_pile: drawPile,
    discard_pile: [],
    top_card: top,
    required_color: null,
    draw_penalty: 0,
    draw_penalty_kind: null,
    drawn_card_id: null,
    status_message: null,
    winner_player_id: null,
    finish_order: [],
    turn_deadline_at: null,
    // Fields required by the type but not used by the solo rule subset. Kept
    // null so the shipping DB engine's parsers still accept a solo state if
    // one ever needs to be piped through them.
    pending_wild: null,
    challenge_prev_color: null,
    wd4_player_id: null,
    uno_pending_player: null,
    uno_called: false,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  }

  return {
    session,
    hands,
    log: [`${NAMES[TURN_ORDER[first]!]} to lead — top card is ${top.color} ${describeCard(top)}`],
    outcome: null,
    startedAt: opts.now ?? 0,
  }
}

function describeCard(card: UnoCard): string {
  if (card.kind === 'number') return String(card.value ?? '')
  return card.kind
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function log(state: UnoSoloState, line: string): UnoSoloState {
  return { ...state, log: [...state.log, line].slice(-LOG_LIMIT) }
}

function otherIdx(idx: 0 | 1): 0 | 1 {
  return idx === 0 ? 1 : 0
}

function currentPlayerIdx(state: UnoSoloState): 0 | 1 {
  return (state.session.current_turn_index as 0 | 1) ?? 0
}

function refill(pile: UnoCard[], discard: UnoCard[], rng: () => number): { pile: UnoCard[]; discard: UnoCard[] } {
  if (pile.length > 0 || discard.length === 0) return { pile, discard }
  return { pile: shuffle(discard, rng), discard: [] }
}

function drawWithRefill(
  pile: UnoCard[],
  discard: UnoCard[],
  count: number,
  rng: () => number
): { drawn: UnoCard[]; pile: UnoCard[]; discard: UnoCard[]; reshuffled: boolean } {
  let p = [...pile]
  let d = [...discard]
  let reshuffled = false
  const drawn: UnoCard[] = []
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

function discardTop(session: UnoSession): UnoCard[] {
  const prev = session.top_card
  if (!prev) return session.discard_pile
  return [...session.discard_pile, prev]
}

/**
 * Turn advance for the classic solo rules:
 *   Skip     → 2 steps forward → same seat in 2p
 *   Reverse  → flip direction → same as skip in 2p
 *   else     → next seat
 */
function advanceIndex(state: UnoSoloState, card: UnoCard): { index: number; direction: number } {
  let direction = state.session.direction < 0 ? -1 : 1
  const cur = state.session.current_turn_index as 0 | 1
  if (card.kind === 'reverse') {
    // Reverse in a 2-player game acts as a skip — the "opposite direction" of
    // "go to the next player" is "stay with the same player".
    direction = -direction
    return { index: cur, direction }
  }
  if (card.kind === 'skip') {
    return { index: cur, direction }
  }
  return { index: otherIdx(cur), direction }
}

// ── Terminal check ──────────────────────────────────────────────────────────

function checkWin(state: UnoSoloState): UnoSoloState {
  if (state.hands[0].length === 0 || state.hands[1].length === 0) {
    const winner: UnoSoloOutcome = state.hands[0].length === 0 ? 0 : 1
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

// ── Legality (thin wrapper on the engine helper) ────────────────────────────

/**
 * Solo's legality is the engine's `canPlayCard` plus one solo-only rule: any
 * pending draw penalty MUST be drawn (no stacking) — same as classic UNO
 * without house rules.
 */
export function isPlayable(state: UnoSoloState, card: UnoCard): boolean {
  if ((state.session.draw_penalty ?? 0) > 0) return false
  return canPlayCardEngine(card, state.session)
}

// ── Actions ─────────────────────────────────────────────────────────────────

export type UnoSoloStepResult = { state: UnoSoloState; error?: string }

function requirePlayingPhase(state: UnoSoloState, playerIdx: 0 | 1): string | null {
  if (state.outcome != null) return 'Game is finished'
  if (state.session.phase === 'choose_color') return 'Choose a colour first'
  if (currentPlayerIdx(state) !== playerIdx) return 'Not your turn'
  return null
}

/**
 * Play `cardId` from `playerIdx`'s hand.
 *   Wild + Wild Draw 4 → pause for colour choice (with pending draw-4 for the
 *                        opponent, or nothing for a plain Wild)
 *   Draw 2             → opponent draws 2
 *   Skip / Reverse     → skip effect in 2p
 *   Number             → match by colour or value
 */
export function unoSoloPlay(
  state: UnoSoloState,
  playerIdx: 0 | 1,
  cardId: string,
  rng: () => number
): UnoSoloStepResult {
  const gate = requirePlayingPhase(state, playerIdx)
  if (gate) return { state, error: gate }

  const hand = state.hands[playerIdx]
  const idx = hand.findIndex((c) => c.id === cardId)
  if (idx < 0) return { state, error: 'Card not in hand' }
  const card = hand[idx]!

  if ((state.session.draw_penalty ?? 0) > 0) return { state, error: `Draw ${state.session.draw_penalty} first` }
  if (!canPlayCardEngine(card, state.session)) return { state, error: 'Cannot play that card' }

  const newHand = hand.filter((_, i) => i !== idx)
  const nextHands: [UnoCard[], UnoCard[]] = [...state.hands] as [UnoCard[], UnoCard[]]
  nextHands[playerIdx] = newHand
  const wentOut = newHand.length === 0

  // Wild with cards left → pause for colour choice.
  if (isWildCard(card) && !wentOut) {
    const penalty = card.kind === 'wild_draw4' ? 4 : 0
    const nextSession: UnoSession = {
      ...state.session,
      top_card: card,
      discard_pile: discardTop(state.session),
      required_color: null,
      draw_penalty: penalty,
      draw_penalty_kind: penalty > 0 ? 'wild_draw4' : null,
      phase: 'choose_color',
    }
    return {
      state: log(
        { ...state, session: nextSession, hands: nextHands },
        `${NAMES[TURN_ORDER[playerIdx]!]} played ${card.kind === 'wild_draw4' ? 'Wild Draw 4' : 'Wild'} — choosing colour…`
      ),
    }
  }

  // Non-wild play (and wild-as-last-card, which wins immediately).
  const { index: nextIndex, direction } = advanceIndex(state, card)
  const drawPenalty = card.kind === 'draw2' ? 2 : 0

  const nextSession: UnoSession = {
    ...state.session,
    top_card: card,
    required_color: null,
    draw_penalty: drawPenalty,
    draw_penalty_kind: drawPenalty > 0 ? 'draw2' : null,
    discard_pile: discardTop(state.session),
    current_turn_index: nextIndex,
    direction,
    phase: wentOut ? 'finished' : 'playing',
    winner_player_id: wentOut ? TURN_ORDER[playerIdx] : null,
    finish_order: wentOut ? [TURN_ORDER[playerIdx]!] : state.session.finish_order,
  }

  const notes: string[] = [`${NAMES[TURN_ORDER[playerIdx]!]} played ${card.color} ${describeCard(card)}`]
  if (card.kind === 'draw2') notes.push('Draw 2')
  else if (card.kind === 'skip') notes.push('Skip')
  else if (card.kind === 'reverse') notes.push('Reverse')

  void rng
  let next: UnoSoloState = log({ ...state, session: nextSession, hands: nextHands }, notes.join(' · '))
  next = checkWin(next)
  return { state: next }
}

/**
 * Draw a card (or the full penalty). Always passes the turn — we intentionally
 * skip the classic "play the drawn card or pass" step to keep the state
 * machine compact.
 */
export function unoSoloDraw(state: UnoSoloState, playerIdx: 0 | 1, rng: () => number): UnoSoloStepResult {
  const gate = requirePlayingPhase(state, playerIdx)
  if (gate) return { state, error: gate }

  const penalty = state.session.draw_penalty ?? 0
  const count = penalty > 0 ? penalty : 1

  const drawRes = drawWithRefill(state.session.draw_pile, state.session.discard_pile, count, rng)
  const hand = state.hands[playerIdx]

  // Both piles empty and no legal play → end by lowest hand-sum, same policy
  // as the DB engine's `finishByLowestHand`.
  if (drawRes.drawn.length === 0) {
    if (hasPlayableCard(hand, state.session)) {
      return { state, error: 'Draw pile is empty — play a card from your hand' }
    }
    const sums: [number, number] = [unoHandSum(state.hands[0]), unoHandSum(state.hands[1])]
    const winner: UnoSoloOutcome = sums[0] === sums[1] ? 'draw' : sums[0] < sums[1] ? 0 : 1
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

  const nextHands: [UnoCard[], UnoCard[]] = [...state.hands] as [UnoCard[], UnoCard[]]
  nextHands[playerIdx] = [...hand, ...drawRes.drawn]

  const nextSession: UnoSession = {
    ...state.session,
    draw_pile: drawRes.pile,
    discard_pile: drawRes.discard,
    draw_penalty: 0,
    draw_penalty_kind: null,
    current_turn_index: otherIdx(playerIdx),
  }

  const note =
    penalty > 0
      ? `${NAMES[TURN_ORDER[playerIdx]!]} drew ${drawRes.drawn.length} (penalty)`
      : `${NAMES[TURN_ORDER[playerIdx]!]} drew 1`

  return { state: log({ ...state, session: nextSession, hands: nextHands }, note) }
}

/**
 * After playing a Wild: name the colour the opponent must match. Any pending
 * Draw 4 stays queued for the opponent.
 */
export function unoSoloChooseColor(state: UnoSoloState, playerIdx: 0 | 1, color: UnoColor): UnoSoloStepResult {
  if (state.session.phase !== 'choose_color') return { state, error: 'Not choosing colour' }
  if (currentPlayerIdx(state) !== playerIdx) return { state, error: 'Not your turn' }

  const nextSession: UnoSession = {
    ...state.session,
    required_color: color,
    phase: 'playing',
    current_turn_index: otherIdx(playerIdx),
  }
  return {
    state: log({ ...state, session: nextSession }, `${NAMES[TURN_ORDER[playerIdx]!]} called ${color}`),
  }
}

/** Card point tally — exposed for tests. */
export const soloCardPoints = cardPoints
