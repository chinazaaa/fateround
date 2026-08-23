import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertHostGame, assertHostPlayerRemove } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { parseGameType } from '@/lib/game-types'
import { fetchGamePlayerLimits, lobbyMaxPlayersFromGame } from '@/lib/game-limits'
import { firstAvailableMonopolyToken } from '@/lib/monopoly-tokens'
import { internalErrorMessage } from '@/lib/api-errors'
import { gameSupportsBots } from '@/lib/bots-in-room'
import { getProfileFromRequest } from '@/lib/identity-server'
import { EXTRA_BOT_COST } from '@/lib/coins/shop-catalog'

/**
 * Bots-in-room — add/remove a bot seat in an existing game lobby.
 *
 * POST   /api/games/[code]/bots       add a bot (host-only, lobby-only)
 * DELETE /api/games/[code]/bots?id=X  remove a bot (host, lobby OR active — see below)
 *
 * ── Load-bearing invariants (see docs/bots-in-room-plan.md) ───────────────
 *   - Bots are real `players` rows with is_bot=true. Every existing route
 *     that touches players works on them without special-casing.
 *   - Bots never keep a human out: the seat-cap check on POST includes
 *     bots in the count, so once a room is full, "+ Add bot" fails. The
 *     late-join displacement is handled elsewhere (players POST route) —
 *     a human arriving at a bot-padded room evicts a bot there.
 *
 * ── Which games? ──────────────────────────────────────────────────────────
 * Phase 1 wired Whot, Phase 2 Monopoly, Phase 3 Crazy Eights. Other game types
 * return 400 with a clear message. The list is NOT kept here: it is derived in
 * `src/lib/bots-in-room.ts` from the same map the game-tick uses to poke bot
 * drivers, so a game can only become bot-seatable once something exists to
 * actually take its turns.
 */

const addSchema = z.object({
  hostToken: z.string().min(1),
  /**
   * Coin cost the client expected to pay. 0 for the free first bot, 50 for
   * every subsequent bot. If the client's view of the bot count disagrees
   * with the server's (someone else in another tab just added one), the
   * server rejects with 409 so the client re-renders the button at the
   * right price rather than silently over/under-charging.
   */
  expectedPriceCoins: z.number().int().nonnegative().max(EXTRA_BOT_COST).optional(),
})

// The next available "Bot N" name that isn't already taken in this game.
// Kept dead simple — no anthropomorphic names, no cute puns. The 🤖 avatar
// is the visual anchor; the name is just an identifier.
function pickBotName(existing: Set<string>): string {
  for (let n = 1; n < 100; n += 1) {
    const candidate = `Bot ${n}`
    if (!existing.has(candidate.toLowerCase())) return candidate
  }
  return `Bot ${Date.now() % 1000}` // extraordinarily unlikely fallback
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params
  const { data: body, error: bodyError } = await parseJsonBody(req, addSchema)
  if (bodyError) return bodyError

  const supabase = getSupabaseAdmin()
  const code = raw.toUpperCase()

  // Host-only, lobby-only. Bots are added before the game starts; adding a bot
  // mid-game would need to deal it a hand from a mid-game deck, which is out
  // of scope for Phase 1 (documented in the plan as a Phase 2 consideration).
  const auth = await assertHostGame(supabase, code, body.hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const game = auth.game

  const gameType = parseGameType(game.game_type)
  if (!gameSupportsBots(gameType)) {
    return NextResponse.json({ error: `Bots aren't supported for ${game.game_type} yet` }, { status: 400 })
  }

  // Seat allocation — the "humans + bots" count must not equal max_players.
  // Spectators don't consume seats and are excluded, matching every other
  // seat-cap check in this route. The cast is safe because the bots-supported gate
  // above has already narrowed the game type to something lobbyMaxPlayersFromGame
  // understands.
  const limits = await fetchGamePlayerLimits(supabase)
  const maxPlayers = lobbyMaxPlayersFromGame(gameType as Parameters<typeof lobbyMaxPlayersFromGame>[0], game, limits)
  const { data: seated, error: seatedErr } = await supabase
    .from('players')
    .select('id, name, is_bot, spectator, monopoly_token')
    .eq('game_id', code)
    .eq('spectator', false)
  if (seatedErr) return NextResponse.json({ error: internalErrorMessage('bots', seatedErr) }, { status: 500 })

  const currentCount = seated?.length ?? 0
  if (currentCount >= maxPlayers) {
    return NextResponse.json({ error: 'Room is already full — remove a player first' }, { status: 400 })
  }

  // It'd be weird to have 1 human + N bots, so enforce a soft "at least one
  // bot-less seat" rule: at most (max - 1) bots. A host who wants to play alone
  // has /play-solo/<game> for exactly that.
  const currentBots = (seated ?? []).filter((p) => p.is_bot).length
  if (currentBots >= maxPlayers - 1) {
    return NextResponse.json({ error: 'At least one seat must be reserved for a human' }, { status: 400 })
  }

  const existingNames = new Set((seated ?? []).map((p) => p.name.toLowerCase()))
  const botName = pickBotName(existingNames)

  // Monopoly requires each seated player to carry a token (car/hat/dog/…) so
  // the board can render their piece. Human joiners pick one in the join form;
  // for bots we auto-pick the first unused token. If somehow the game already
  // has all 10 tokens taken (impossible given max 6 players), we fall through
  // to null — the engine tolerates it and the UI falls back to an ordinal glyph.
  const monopolyToken = parseGameType(game.game_type) === 'monopoly' ? firstAvailableMonopolyToken(seated ?? []) : null

  // Phase 3 coin gate: first bot in the room is free; every subsequent bot
  // costs EXTRA_BOT_COST coins per bot per room (plan §"Inline (contextual)"
  // and §"Decisions" #6). Consumable — no owned-row; ref_id points at the
  // added-bot player uuid so the ledger row is 1:1 with the insertion and
  // the shop_purchase durable-uniqueness index (which requires a durable
  // <kind>:<slug> prefix) does NOT match. Re-purchasable per room by design.
  const needsPayment = currentBots >= 1
  const price = needsPayment ? EXTRA_BOT_COST : 0
  if ((body.expectedPriceCoins ?? 0) !== price) {
    return NextResponse.json(
      { error: 'Bot pricing changed while you were adding — try again', expectedPriceCoins: price },
      { status: 409 }
    )
  }

  const profileId = needsPayment ? await getProfileFromRequest(req) : null
  if (needsPayment && !profileId) {
    return NextResponse.json({ error: 'Save your profile to buy extra bots' }, { status: 401 })
  }

  const { data: player, error } = await supabase
    .from('players')
    .insert({
      game_id: code,
      country: null,
      name: botName,
      gender: 'both',
      identity_gender: null,
      participant_id: null,
      spectator: false,
      is_bot: true,
      monopoly_token: monopolyToken,
    })
    .select('id, name, is_bot')
    .single()

  if (error) return NextResponse.json({ error: internalErrorMessage('bots', error) }, { status: 500 })

  let charged = 0
  let newBalance: number | null = null
  if (needsPayment && profileId) {
    const { data: spendResult, error: spendErr } = await supabase.rpc('spend_coins', {
      p_profile_id: profileId,
      p_delta: price,
      p_reason: 'shop_purchase',
      p_ref_id: `extra_bot:${player.id}`,
    })
    // If the spend failed for insufficient funds we have to unwind the bot
    // insert — otherwise the host got a free bot AND a soft error. Same for
    // a hard RPC error: the seat is nobody's, delete it.
    if (spendErr || spendResult === null) {
      await supabase.from('players').delete().eq('id', player.id)
      if (spendErr) {
        return NextResponse.json({ error: internalErrorMessage('bots', spendErr) }, { status: 500 })
      }
      return NextResponse.json(
        { error: `Not enough coins — ${price} coins needed to add an extra bot.` },
        { status: 402 }
      )
    }
    charged = price
    newBalance = Number(spendResult)
  }

  return NextResponse.json({ ok: true, player, charged, newBalance })
}

const removeSchema = z.object({ hostToken: z.string().min(1), playerId: z.string().uuid() })

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params
  const { data: body, error: bodyError } = await parseJsonBody(req, removeSchema)
  if (bodyError) return bodyError

  const supabase = getSupabaseAdmin()
  const code = raw.toUpperCase()

  // Removing a bot is allowed in the lobby (obvious) AND in an active game
  // (a human joining a full-of-bots room evicts one — that path uses this
  // same authorization surface). Uses the "player-remove" host auth which
  // permits both statuses.
  const auth = await assertHostPlayerRemove(supabase, code, body.hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: target, error: readErr } = await supabase
    .from('players')
    .select('id, is_bot, game_id')
    .eq('id', body.playerId)
    .eq('game_id', code)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: internalErrorMessage('bots', readErr) }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  if (!target.is_bot) {
    return NextResponse.json({ error: 'Not a bot — use the player-remove endpoint' }, { status: 400 })
  }

  const { error } = await supabase.from('players').delete().eq('id', body.playerId).eq('game_id', code)
  if (error) return NextResponse.json({ error: internalErrorMessage('bots', error) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
