import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  processMonopolyRoll,
  processMonopolyBuy,
  processMonopolyJailPay,
  processMonopolyPayRent,
  processMonopolySettleDebt,
  processMonopolyBuild,
  processMonopolyMortgage,
  processMonopolyForfeit,
  processMonopolyAuction,
  processMonopolyTradeRespond,
  advanceMonopolyTurnPastBankrupt,
  isTurnHolderBankrupt,
} from '@/lib/monopoly'
import { scheduleTurnNotification } from '@/lib/push'
import { pickBotAction, type MonopolyBotAction } from '@/lib/monopoly-bot'
import { adaptMonopolyForBot } from '@/lib/monopoly-bot-adapter'
import type { MonopolyBoard, MonopolyPlayerState } from '@/types'

/**
 * Server-side Monopoly bot driver — Phase 2 counterpart of `whot-bot-driver`.
 *
 * Called from the game-tick loop for every active Monopoly game (see
 * `src/lib/game-tick.ts`). For a given game code, this:
 *   1. Fast-bails if the game has no bots (one indexed-count query).
 *   2. Loads the board + player_state rows.
 *   3. Picks the ONE bot that could act this tick — the auction current-bidder
 *      if an auction is live and it's a bot, else the turn-order current player
 *      if that's a bot. Auction is checked first because it runs outside
 *      turn_order and can advance without any turn transition.
 *   4. Adapts to a MonopolyBotView, picks an action, applies it via the
 *      `processMonopoly*` pure functions the API routes call.
 *
 * ── Why call the process* fns directly instead of POSTing to the routes ──
 * Same reasoning as `whot-bot-driver`: the route layer wraps these calls with
 * `resume_token` auth that bots don't have, and adds an HTTP round-trip for no
 * gain when both caller and callee run in the same Node process. Reproducing
 * the routes' side effect (push scheduling) is a one-liner (`scheduleTurnNotification`).
 *
 * ── Concurrency + idempotency ────────────────────────────────────────────
 * The game-tick's own `inFlight` guard prevents overlapping ticks per game.
 * Every processMonopoly* function is CAS-guarded on `board.updated_at`; a
 * lost race returns cleanly without side effects, and the next tick
 * re-evaluates from fresh state. Errors are logged and treated as no-ops.
 *
 * ── Why this is a separate ROUTE, not a direct instrumentation import ────
 * The driver transitively imports `web-push` via `scheduleTurnNotification`.
 * If we imported it into `src/instrumentation.ts` (the loop lives there),
 * the edge-runtime compile of that file breaks — the same crash the
 * tournament-reminder ticker in PR #878 hit. The ticker POSTs to
 * `/api/monopoly/bot-tick` instead, which forces the driver onto the
 * `nodejs` runtime where `web-push` is fine.
 */

export type DriveResult =
  | { kind: 'idle' } // no bots, or none of them had an actionable slot
  | { kind: 'skipped'; reason: string } // bot's slot but nothing sensible to do
  | { kind: 'played'; action: MonopolyBotAction['type'] }

export async function driveMonopolyBotsOnce(gameCode: string): Promise<DriveResult> {
  const admin = getSupabaseAdmin()
  const code = gameCode.toUpperCase()

  // Fast path — same partial index as Whot (from 20260925120000_players_is_bot.sql).
  const { count: botCount } = await admin
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', code)
    .eq('is_bot', true)
  if (!botCount || botCount === 0) return { kind: 'idle' }

  const [boardRes, statesRes] = await Promise.all([
    admin.from('monopoly_boards').select('*').eq('game_id', code).maybeSingle(),
    admin.from('monopoly_player_state').select('*').eq('game_id', code).order('player_order'),
  ])
  const board = boardRes.data as MonopolyBoard | null
  const states = (statesRes.data ?? []) as MonopolyPlayerState[]
  if (!board || board.phase === 'finished') return { kind: 'idle' }

  // If the turn is parked on a bankrupt player (whose bot adapter would return
  // null and whose human UI is disabled), the game stalls forever. Advance the
  // turn off them so the next tick sees a live holder. This is defensive —
  // normal engine paths route through nextTurnIndex which skips bankrupts.
  if (isTurnHolderBankrupt(board, states)) {
    const { advanced } = await advanceMonopolyTurnPastBankrupt(admin, code)
    return advanced ? { kind: 'skipped', reason: 'advanced past bankrupt turn holder' } : { kind: 'idle' }
  }

  // Pick the actionable slot. Priority: pending trade addressed at a bot >
  // auction current-bidder > turn holder. Trades and auctions run outside the
  // turn order and both block the game until resolved — trades block the
  // human proposer's turn, auctions block the initiator's — so we resolve
  // them BEFORE giving another bot its regular turn move.
  const tradeToId = board.pending_trade?.to_player_id ?? null
  const auctionBidderId = board.auction_state?.current_bidder_id ?? null
  const turnHolderId = board.turn_order?.[board.current_turn_index] ?? null

  // Confirm each candidate is actually a bot. One `players` read covers all
  // slots (deduplicated ids; a null slot resolves the same way).
  const candidateIds = Array.from(
    new Set([tradeToId, auctionBidderId, turnHolderId].filter((id): id is string => Boolean(id)))
  )
  if (candidateIds.length === 0) return { kind: 'idle' }
  const { data: candidates } = await admin
    .from('players')
    .select('id, is_bot')
    .eq('game_id', code)
    .in('id', candidateIds)
  const isBotById = new Map((candidates ?? []).map((p) => [p.id, p.is_bot]))

  let actionableBotId: string | null = null
  if (tradeToId && isBotById.get(tradeToId)) actionableBotId = tradeToId
  else if (auctionBidderId && isBotById.get(auctionBidderId)) actionableBotId = auctionBidderId
  else if (turnHolderId && isBotById.get(turnHolderId)) actionableBotId = turnHolderId

  if (!actionableBotId) return { kind: 'idle' }

  const view = adaptMonopolyForBot(board, states, actionableBotId)
  if (!view) return { kind: 'idle' }

  const action = pickBotAction(view)
  if (!action) return { kind: 'skipped', reason: 'no action from heuristic' }

  const { error } = await applyMonopolyBotAction(admin, code, actionableBotId, action)
  if (error) return { kind: 'skipped', reason: error }

  // Notify the next human whose turn it is. Safe when the next actor is also
  // a bot — bots have no push subscriptions so the send is a no-op.
  scheduleTurnNotification(code)
  return { kind: 'played', action: action.type }
}

/**
 * One dispatch table for the entire MonopolyBotAction union. Split out so the
 * driver's control flow stays a straight line and each mapping is auditable.
 */
async function applyMonopolyBotAction(
  admin: ReturnType<typeof getSupabaseAdmin>,
  gameCode: string,
  botPlayerId: string,
  action: MonopolyBotAction
): Promise<{ error?: string }> {
  switch (action.type) {
    case 'roll':
    case 'jail_roll':
      // Roll works for both roll and jail phases (engine allows it in jail).
      return processMonopolyRoll(admin, gameCode, botPlayerId)
    case 'buy':
      return processMonopolyBuy(admin, gameCode, botPlayerId, action.decision)
    case 'jail_pay':
      return processMonopolyJailPay(admin, gameCode, botPlayerId, 'pay')
    case 'jail_card':
      return processMonopolyJailPay(admin, gameCode, botPlayerId, 'card')
    case 'pay_rent':
      return processMonopolyPayRent(admin, gameCode, botPlayerId)
    case 'settle_debt':
      return processMonopolySettleDebt(admin, gameCode, botPlayerId)
    case 'sell_house':
      return processMonopolyBuild(admin, gameCode, botPlayerId, action.spaceIndex, 'sell_house')
    case 'sell_hotel':
      return processMonopolyBuild(admin, gameCode, botPlayerId, action.spaceIndex, 'sell_hotel')
    case 'build_house':
      return processMonopolyBuild(admin, gameCode, botPlayerId, action.spaceIndex, 'buy_house')
    case 'build_hotel':
      return processMonopolyBuild(admin, gameCode, botPlayerId, action.spaceIndex, 'buy_hotel')
    case 'mortgage':
      return processMonopolyMortgage(admin, gameCode, botPlayerId, action.spaceIndex, 'mortgage')
    case 'forfeit':
      return processMonopolyForfeit(admin, gameCode, botPlayerId)
    case 'auction_bid':
      return processMonopolyAuction(admin, gameCode, botPlayerId, 'bid', action.amount)
    case 'auction_pass':
      return processMonopolyAuction(admin, gameCode, botPlayerId, 'pass')
    case 'trade_accept':
      return processMonopolyTradeRespond(admin, gameCode, botPlayerId, true)
    case 'trade_decline':
      return processMonopolyTradeRespond(admin, gameCode, botPlayerId, false)
  }
}
