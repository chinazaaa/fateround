/**
 * Adapter: DB Crazy Eights state → Crazy8SoloState, so the existing solo bot
 * (`pickBotAction` in `crazy-eights-bot.ts`) can drive a bot player inside a REAL
 * multiplayer room.
 *
 * Mirrors `whot-bot-adapter.ts` — same shape, same reasoning, same limitation. Read that
 * file's header for the full rationale; the Crazy-Eights-specific notes follow.
 *
 * ── The 2-player view ────────────────────────────────────────────────────
 * A room has 2–8 players; the bot only needs the current player (itself) and the player
 * about to be hit by a Pick 2 / Joker / Skip. So the adapter builds a minimal 2-seat view:
 *
 *   seat 0 = "opponent"  (the next seat in turn order, respecting `direction`)
 *   seat 1 = the bot itself
 *
 * The opponent's cards are hidden, so seat 0 gets placeholder cards whose only relevant
 * property is `length` — that's all `normalPlayScore` reads from the opponent for its
 * "attack a short hand" bonus. Nothing in the bot inspects the opponent's individual cards.
 *
 * ── Direction matters here in a way it doesn't for Whot ──────────────────
 * Crazy Eights' Queen reverses play, so `session.direction` can be -1. The "who's next"
 * lookup therefore goes through `crazyEightsNextTurnIndex(session, hands, from, 1, direction)`
 * — the same helper the engine uses — rather than a bare `(i + 1) % n`. Getting this wrong
 * would point the bot's short-hand heuristic at the player it just played PAST.
 *
 * ── Rules are real, not assumed ──────────────────────────────────────────
 * Unlike UNO's solo engine (which hardcodes one rule subset), `Crazy8SoloState` carries a
 * full `CrazyEightsRules` — the SAME type the multiplayer engine parses out of the game row.
 * So the bot honours the host's action-cards / jokers / pick-2-stacking toggles for free, and
 * there is no rule combination that needs the bot disabled. The caller passes the room's real
 * parsed rules straight through.
 *
 * ── What this is NOT ─────────────────────────────────────────────────────
 * A multiplayer-aware bot. It reasons about one opponent, not N. That's a deliberate
 * carry-over from Phase 1: the goal is a credible bot on proven infrastructure, not a
 * stronger bot. When a multi-opponent heuristic lands, this adapter grows or goes away.
 */

import type { CrazyEightsCard, CrazyEightsPlayerHand, CrazyEightsSession } from '@/types'
import { crazyEightsNextTurnIndex, parseCrazyEightsRules, type CrazyEightsRules } from '@/lib/crazy-eights'
import { CRAZY8_SOLO_BOT_ID, CRAZY8_SOLO_HUMAN_ID, type Crazy8SoloState } from '@/lib/crazy-eights-solo'

export type Crazy8AdapterResult = {
  /** Crazy8SoloState the bot heuristic can run against. */
  soloState: Crazy8SoloState
  /** Real DB id of the bot player, for applying the action the heuristic returns. */
  botPlayerId: string
  /** True when it really is this bot's turn in the DB session — else the caller must not act. */
  isBotTurn: boolean
}

/**
 * Build a Crazy8SoloState oriented from a specific bot player's perspective.
 *
 * Returns `isBotTurn: false` (with a still-valid soloState) when it isn't this bot's turn —
 * the caller skips. Returns `null` when the bot isn't seated in the game, or it's over.
 */
export function adaptForCrazy8Bot(
  session: CrazyEightsSession,
  hands: CrazyEightsPlayerHand[],
  botPlayerId: string,
  rules: CrazyEightsRules = parseCrazyEightsRules(null)
): Crazy8AdapterResult | null {
  if (session.phase === 'finished') return null

  const turnOrder = session.turn_order ?? []
  const botIdx = turnOrder.indexOf(botPlayerId)
  if (botIdx < 0) return null

  const botHandRow = hands.find((h) => h.player_id === botPlayerId)?.cards
  if (!Array.isArray(botHandRow)) return null
  const botHand = botHandRow as CrazyEightsCard[]

  // Who takes the brunt of a Pick 2 / Joker: the next seat from the CURRENT one, following
  // `direction` (a Queen may have reversed play) and skipping players who are already out.
  // Falls back to the bot itself in the degenerate single-seat case so the state still builds.
  const nextIdx = crazyEightsNextTurnIndex(session, hands, session.current_turn_index, 1, session.direction ?? 1)
  const opponentPlayerId = turnOrder[nextIdx] ?? botPlayerId
  const opponentCards = hands.find((h) => h.player_id === opponentPlayerId)?.cards
  const opponentCount = Array.isArray(opponentCards) ? opponentCards.length : 0

  // Placeholders for seat 0 — only `length` is ever read. `rank: -1` is not a rank any real
  // card carries (Ace = 1 … King = 13, Joker = 0), so a stray legality check on one of these
  // could never accidentally match the top card.
  const placeholderOpponent: CrazyEightsCard[] = Array.from({ length: opponentCount }, (_, i) => ({
    id: `opponent-${i}`,
    suit: 'joker',
    rank: -1,
  }))

  // The solo state's turn_order is fixed [human, bot]; `pickBotAction` acts only when
  // `current_turn_index` points at the bot's seat. When the DB turn belongs to someone else
  // we still construct a valid state but point the index at seat 0, so the heuristic returns
  // null and `isBotTurn` tells the caller to skip.
  const isBotTurn = session.current_turn_index === botIdx
  const soloSession: CrazyEightsSession = {
    ...session,
    turn_order: [CRAZY8_SOLO_HUMAN_ID, CRAZY8_SOLO_BOT_ID],
    current_turn_index: isBotTurn ? 1 : 0,
    // Direction is normalised to forward: in a 2-seat view a reverse and a skip are the same
    // move, and the bot's scoring reads the CARD, never `direction`. Leaving the room's -1 in
    // place would make `crazyEightsNextTurnIndex` walk off the 2-seat view backwards.
    direction: 1,
    // Draw/discard piles pass through unchanged — the bot reads the discard for its suit-call
    // inference and the draw pile only for counts, both of which mean the same in a room.
  }

  return {
    soloState: {
      session: soloSession,
      hands: [placeholderOpponent, botHand],
      rules,
      log: [],
      outcome: null,
      startedAt: 0,
    },
    botPlayerId,
    isBotTurn,
  }
}
