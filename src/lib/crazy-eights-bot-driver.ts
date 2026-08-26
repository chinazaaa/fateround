import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  parseCrazyEightsRules,
  processCrazyEightsPlay,
  processCrazyEightsDraw,
  processCrazyEightsChoose,
} from '@/lib/crazy-eights'
import { scheduleTurnNotification } from '@/lib/push'
import { pickBotAction } from '@/lib/crazy-eights-bot'
import { adaptForCrazy8Bot } from '@/lib/crazy-eights-bot-adapter'
import type { CrazyEightsPlayerHand, CrazyEightsSession } from '@/types'

/**
 * Server-side Crazy Eights bot driver — bots-in-room Phase 3.
 *
 * Called from the game-tick loop (`src/lib/game-tick.ts`) via `/api/crazy-eights/bot-tick`:
 * loads the session + hands for one game, checks whether the current player is a bot, picks
 * that bot's next action through the adapter, and applies it with the same
 * `processCrazyEights*` entrypoints the `/api/crazy-eights/*` routes call.
 *
 * This is the Whot driver (`whot-bot-driver.ts`) with the Crazy Eights nouns swapped in —
 * same shape, same reasoning. Its header explains the two decisions worth restating:
 *
 *  - **Why call `process*` directly rather than POSTing to the routes.** The route layer adds
 *    `resume_token` auth (a bot has no human typing a token; we resolved its id from the DB)
 *    and an HTTP hop between two points in the same Node process. The one behaviour that
 *    matters — scheduling the "your turn" push so a human in a backgrounded tab is nudged —
 *    is reproduced explicitly below.
 *  - **Concurrency.** The ticker's `inFlight` guard stops two ticks overlapping, and every
 *    `processCrazyEights*` call goes through the engine's atomic session CAS. If the driver
 *    races a human's real move, one write wins and the other returns an error string, which
 *    is treated as a no-op; the next tick re-reads fresh state.
 */

export type Crazy8DriveResult =
  | { kind: 'idle' } // no bots, or none of them holds the turn
  | { kind: 'skipped'; reason: string } // bot's turn but nothing sensible to do
  | { kind: 'played'; action: 'play' | 'draw' | 'choose_suit' }

/**
 * Run one bot decision for the given Crazy Eights game code. Cheap when there are no bots
 * (one indexed count query, then return). Safe to call every tick.
 */
export async function driveCrazy8BotsOnce(gameCode: string): Promise<Crazy8DriveResult> {
  const admin = getSupabaseAdmin()
  const code = gameCode.toUpperCase()

  // Fast path: does this game have ANY bots? Uses the partial index from
  // 20260925120000_players_is_bot.sql, so a bot-free game costs one indexed lookup.
  const { count: botCount } = await admin
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', code)
    .eq('is_bot', true)
  if (!botCount || botCount === 0) return { kind: 'idle' }

  // Narrow pre-check before paying for the full state. `crazy_eights_sessions` carries the
  // whole draw and discard piles as JSONB and `crazy_eights_player_hands` every player's
  // cards — too much to pull every 2.5s tick when the common case is that a HUMAN holds the
  // turn. Read only what resolves turn order first.
  const { data: turnRow } = await admin
    .from('crazy_eights_sessions')
    .select('phase, turn_order, current_turn_index')
    .eq('game_id', code)
    .maybeSingle()
  if (!turnRow || turnRow.phase === 'finished') return { kind: 'idle' }
  const turnPlayerId = turnRow.turn_order?.[turnRow.current_turn_index]
  if (!turnPlayerId) return { kind: 'idle' }

  const { data: turnPlayer } = await admin
    .from('players')
    .select('id, is_bot')
    .eq('id', turnPlayerId)
    .eq('game_id', code)
    .maybeSingle()
  if (!turnPlayer?.is_bot) return { kind: 'idle' }

  // It really is a bot's turn — now the full read is worth it.
  const [sessionRes, handsRes, gameRes] = await Promise.all([
    admin.from('crazy_eights_sessions').select('*').eq('game_id', code).maybeSingle(),
    admin.from('crazy_eights_player_hands').select('*').eq('game_id', code).order('player_order'),
    admin
      .from('games')
      .select('crazy8_action_cards, crazy8_jokers, crazy8_pick2_stacking')
      .eq('id', code)
      .maybeSingle(),
  ])
  const session = sessionRes.data as CrazyEightsSession | null
  const hands = (handsRes.data ?? []) as CrazyEightsPlayerHand[]
  // Re-check: the phase could have flipped to 'finished' between the two reads.
  if (!session || session.phase === 'finished') return { kind: 'idle' }

  // The room's REAL rules, not defaults — the bot honours the host's action-cards / jokers /
  // pick-2-stacking toggles because `Crazy8SoloState` carries the same rules type the engine
  // parses. No rule combination needs the bot switched off.
  const rules = parseCrazyEightsRules(gameRes.data ?? null)
  const adapted = adaptForCrazy8Bot(session, hands, turnPlayerId, rules)
  if (!adapted || !adapted.isBotTurn) return { kind: 'idle' }

  const action = pickBotAction(adapted.soloState, 'normal')
  if (!action) return { kind: 'skipped', reason: 'no action from heuristic' }

  // Apply via the same process* function the API route calls. An engine error (lost CAS, a
  // human beat us to the move, game expired mid-decision) is a no-op; the next tick re-reads.
  let outcome: 'play' | 'draw' | 'choose_suit'
  let engineError: string | undefined
  if (action.type === 'play') {
    ;({ error: engineError } = await processCrazyEightsPlay(admin, code, turnPlayerId, action.cardId))
    outcome = 'play'
  } else if (action.type === 'draw') {
    ;({ error: engineError } = await processCrazyEightsDraw(admin, code, turnPlayerId))
    outcome = 'draw'
  } else {
    ;({ error: engineError } = await processCrazyEightsChoose(admin, code, turnPlayerId, action.suit))
    outcome = 'choose_suit'
  }

  if (engineError) return { kind: 'skipped', reason: engineError }

  // Mirror the routes: nudge whoever is up next. Safe when that's another bot — the push
  // routes only reach real browsers with subscriptions, and bots have none.
  scheduleTurnNotification(code)

  return { kind: 'played', action: outcome }
}
