import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseWhotRules } from '@/lib/whot'
import { processWhotPlay, processWhotDraw, processWhotChoose } from '@/lib/whot'
import { scheduleTurnNotification } from '@/lib/push'
import { pickBotAction } from '@/lib/whot-bot'
import { adaptForBot } from '@/lib/whot-bot-adapter'
import type { WhotPlayerHand, WhotSession } from '@/types'

/**
 * Server-side Whot bot driver.
 *
 * Called from the game-tick loop (see `src/lib/game-tick.ts`): for a given
 * game code, this loads the current session + hands, checks whether the
 * current player is a bot, picks the bot's next action via `pickBotAction`
 * (through the adapter), and applies it via the existing `processWhot*`
 * pure entrypoints — the same functions the /api/whot/* routes call.
 *
 * ── Why call the process* fns directly instead of POSTing to the routes ──
 * The route layer does two extra things solo bots don't need:
 *   1. Auth via `resume_token` — bots don't have humans typing tokens; we
 *      already resolved the bot player id from the DB.
 *   2. HTTP round-trip — needless overhead when both caller and callee run
 *      in the same Node process.
 * Route behaviour (schedule push notification, error handling) is
 * reproduced explicitly below so the human on the other side of the play
 * still gets a "your turn" push in a backgrounded tab.
 *
 * ── Concurrency + idempotency ────────────────────────────────────────────
 * The ticker's own in-flight guard (`inFlight` in game-tick.ts) already
 * prevents two ticks from running at once, and the processWhot* functions
 * use the atomic session CAS built into the shipping engine — so even if
 * the driver races with a human's real move, one wins the update and the
 * other returns `{}` without corrupting state. The driver treats
 * "process returned an error string" as no-op and moves on; the next tick
 * re-evaluates from fresh state.
 */

export type DriveResult =
  | { kind: 'idle' } // no bots, or none of them had the turn
  | { kind: 'skipped'; reason: string } // bot's turn but nothing sensible to do
  | { kind: 'played'; action: 'play' | 'draw' | 'choose_shape' | 'choose_number' }

/**
 * Run one bot decision for the given Whot game code. Cheap when there are
 * no bots (single indexed count query + early return). Safe to call every
 * tick — internal race guard via the engine's session CAS.
 */
export async function driveWhotBotsOnce(gameCode: string): Promise<DriveResult> {
  const admin = getSupabaseAdmin()
  const code = gameCode.toUpperCase()

  // Fast path: does this game have ANY bots? Uses the partial index added in
  // 20260925120000_players_is_bot.sql, so a bot-free game does one indexed
  // lookup returning zero and bails immediately.
  const { count: botCount } = await admin
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', code)
    .eq('is_bot', true)
  if (!botCount || botCount === 0) return { kind: 'idle' }

  // Narrow pre-check: whose turn is it? `whot_sessions` carries the full
  // draw/discard piles (up to 54 cards of JSONB) and `whot_player_hands`
  // carries every player's cards — both expensive to pull on every 2.5s
  // tick. Read only the columns needed to resolve turn order first, so a
  // bot-containing game where a HUMAN currently holds the turn (the common
  // case) costs one small row instead of the full session + all hands.
  const { data: turnRow } = await admin
    .from('whot_sessions')
    .select('phase, turn_order, current_turn_index')
    .eq('game_id', code)
    .maybeSingle()
  if (!turnRow || turnRow.phase === 'finished') return { kind: 'idle' }
  const turnPlayerId = turnRow.turn_order[turnRow.current_turn_index]
  if (!turnPlayerId) return { kind: 'idle' }
  const { data: turnPlayer } = await admin
    .from('players')
    .select('id, is_bot')
    .eq('id', turnPlayerId)
    .eq('game_id', code)
    .maybeSingle()
  if (!turnPlayer?.is_bot) return { kind: 'idle' }

  // It's actually a bot's turn — now it's worth paying for the full state.
  const [sessionRes, handsRes, gameRes] = await Promise.all([
    admin.from('whot_sessions').select('*').eq('game_id', code).maybeSingle(),
    admin.from('whot_player_hands').select('*').eq('game_id', code).order('player_order'),
    admin
      .from('games')
      .select('whot_pick3_enabled, whot_cards_enabled, whot_number_calls_enabled, whot_pick2_stacking')
      .eq('id', code)
      .maybeSingle(),
  ])
  const session = sessionRes.data as WhotSession | null
  const hands = (handsRes.data ?? []) as WhotPlayerHand[]
  // Re-check phase — it could have flipped to 'finished' between the two reads.
  if (!session || session.phase === 'finished') return { kind: 'idle' }

  const rules = parseWhotRules(gameRes.data ?? null)
  const adapted = adaptForBot(session, hands, turnPlayerId, rules)
  if (!adapted || !adapted.isBotTurn) return { kind: 'idle' }

  const action = pickBotAction(adapted.soloState, 'normal')
  if (!action) return { kind: 'skipped', reason: 'no action from heuristic' }

  // Apply the action via the same process* function the API route calls.
  // Errors from the engine (lost turn CAS, engine says "not your turn"
  // because a concurrent human beat us to it, etc.) are treated as no-ops.
  // The next tick re-evaluates.
  let outcome: 'play' | 'draw' | 'choose_shape' | 'choose_number'
  let engineError: string | undefined
  if (action.type === 'play') {
    ;({ error: engineError } = await processWhotPlay(admin, code, turnPlayerId, action.cardId))
    outcome = 'play'
  } else if (action.type === 'draw') {
    ;({ error: engineError } = await processWhotDraw(admin, code, turnPlayerId))
    outcome = 'draw'
  } else if (action.type === 'choose_shape') {
    ;({ error: engineError } = await processWhotChoose(admin, code, turnPlayerId, { shape: action.shape }))
    outcome = 'choose_shape'
  } else {
    ;({ error: engineError } = await processWhotChoose(admin, code, turnPlayerId, { number: action.n }))
    outcome = 'choose_number'
  }

  if (engineError) return { kind: 'skipped', reason: engineError }

  // Schedule the "your turn" push for whoever is next — mirrors what the
  // /api/whot/* routes do after a successful process* call. Safe to call
  // even if the next player is another bot; the push routes filter to real
  // browsers with subscriptions, and bots have none.
  scheduleTurnNotification(code)

  return { kind: 'played', action: outcome }
}
