/**
 * Adapter: DB Whot state → SoloWhotState, so the existing solo Whot bot
 * (`pickBotAction` in `whot-bot.ts`) can drive a bot player inside a REAL
 * multiplayer room.
 *
 * ── Why an adapter instead of a room-native bot ──────────────────────────
 * The solo bot's heuristic is battle-tested (32 tests, plus real play). It
 * takes a `SoloWhotState` — a 2-player snapshot with hands, session, rules.
 * A multiplayer room has 2–6 players; the bot doesn't need to reason about
 * all of them, only the current player (the bot itself) and its immediate
 * next player (the one about to be affected by a Pick 2 / Skip / etc.).
 *
 * So the adapter builds a MINIMAL 2-player view from the bot's perspective:
 *   seat 0 = "opponent"  (the next player in turn_order after the bot)
 *   seat 1 = the bot itself
 *
 * The opponent's actual cards are hidden in Whot, so seat 0 gets a hand of
 * *placeholder* cards whose only relevant property is `length` — that's what
 * `normalPlayScore` reads for the "attack a short hand" heuristic. Nothing
 * else in the bot inspects the opponent's individual cards.
 *
 * ── What this is NOT ─────────────────────────────────────────────────────
 * A general "multiplayer-aware" Whot bot. Extending the solo bot to reason
 * about all N opponents is a Phase 2/3 improvement; Phase 1's goal is to
 * prove the infrastructure — a bot inside a real DB-backed room, driven by
 * the game-tick — not to build a stronger bot. When one lands, the adapter
 * either goes away or grows into a proper multi-opponent view.
 */

import type { WhotCard, WhotPlayerHand, WhotSession } from '@/types'
import { parseWhotRules, whotNextTurnIndex, type WhotRules } from '@/lib/whot'
import { SOLO_BOT_ID, SOLO_HUMAN_ID, type SoloWhotState } from '@/lib/whot-solo'

export type AdapterResult = {
  /** SoloWhotState the bot heuristic can run against. */
  soloState: SoloWhotState
  /**
   * Real DB id of the bot player. The caller uses this to apply the returned
   * action against the DB (`/api/whot/play`, `/draw`, `/choose`).
   */
  botPlayerId: string
  /** True when it really is a bot's turn in the DB session — else the caller must not act. */
  isBotTurn: boolean
}

/**
 * Build a SoloWhotState oriented from a specific bot player's perspective.
 *
 * Returns `isBotTurn: false` (but still a valid soloState) when it's not this
 * bot's turn — the caller should skip in that case. Returns `null` when the
 * bot isn't in the game at all, or the game is finished.
 */
export function adaptForBot(
  session: WhotSession,
  hands: WhotPlayerHand[],
  botPlayerId: string,
  rules: WhotRules = parseWhotRules(null)
): AdapterResult | null {
  if (session.phase === 'finished') return null

  const turnOrder = session.turn_order ?? []
  const botIdx = turnOrder.indexOf(botPlayerId)
  if (botIdx < 0) return null

  const botHand = hands.find((h) => h.player_id === botPlayerId)?.cards ?? []
  if (!Array.isArray(botHand)) return null

  // Pick the "opponent" for the bot's 2-player view: whoever is next in turn
  // order from the CURRENT seat (not from the bot's seat) — that's the player
  // who will be hit by a Pick 2 / Skip. If the current seat IS the bot, the
  // next player after it. Falls back to the bot itself in the degenerate
  // 1-player case so the state still constructs.
  const nextIdx = whotNextTurnIndex(session, hands, session.current_turn_index, 1)
  const opponentPlayerId = turnOrder[nextIdx] ?? botPlayerId
  const opponentHand = hands.find((h) => h.player_id === opponentPlayerId)?.cards ?? []
  const opponentCount = Array.isArray(opponentHand) ? opponentHand.length : 0

  // Placeholder cards for seat 0: only `length` matters (normalPlayScore uses it
  // for the "attack a short hand" bonus). Actual card contents are never read
  // for the opponent — Whot has hidden hands so this is a correct simplification.
  const placeholderOpponent: WhotCard[] = Array.from({ length: opponentCount }, (_, i) => ({
    id: `opponent-${i}`,
    // Any real shape/number would do; use a marker that a stray read couldn't
    // pass canPlayCard by accident.
    shape: 'whot',
    number: 0,
  }))

  // Solo state's turn_order is fixed [SOLO_HUMAN_ID, SOLO_BOT_ID]. Set the
  // current_turn_index so the bot's turn maps to seat 1 (SOLO_BOT_ID) — that's
  // what pickBotAction looks for. If the current DB turn is somebody else, we
  // still construct the state but set current_turn_index=0 so the bot returns
  // null (isBotTurn=false).
  const isBotTurn = session.current_turn_index === botIdx
  const soloSession: WhotSession = {
    ...session,
    turn_order: [SOLO_HUMAN_ID, SOLO_BOT_ID],
    current_turn_index: isBotTurn ? 1 : 0,
    // Draw and discard piles stay as-is; the bot uses draw_pile only for count
    // in the UI and refill fallback (both apply in a room the same way).
  }

  return {
    soloState: {
      session: soloSession,
      hands: [placeholderOpponent, botHand as WhotCard[]],
      rules,
      log: [],
      outcome: null,
      startedAt: 0,
    },
    botPlayerId,
    isBotTurn,
  }
}
