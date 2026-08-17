import 'server-only'
import { after } from 'next/server'
import webpush from 'web-push'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendExpoPushMessages } from '@/lib/expo-push'
import {
  parseGameType,
  isLudoGame,
  isTicTacToeGame,
  isCheckersGame,
  isDraughts10Game,
  isAyoGame,
  isChessGame,
  isWhotGame,
  isScrabbleGame,
  isMonopolyGame,
  isMahjongGame,
  isCrazyEightsGame,
  isSnakeAndLadderGame,
  isYahtzeeGame,
} from '@/lib/game-types'
import { currentPlayerId as ludoCurrentPlayerId } from '@/lib/ludo'
import { currentTurnPlayerId as ticTacToeCurrentTurnPlayerId } from '@/lib/tic-tac-toe'
import { currentTurnPlayerId as checkersCurrentTurnPlayerId } from '@/lib/checkers'
import { currentTurnPlayerId as draughts10CurrentTurnPlayerId } from '@/lib/draughts10'
import { currentTurnPlayerId as ayoCurrentTurnPlayerId } from '@/lib/ayo'
import { currentTurnPlayerId as chessCurrentTurnPlayerId } from '@/lib/chess'
import { currentPlayerId as whotCurrentPlayerId } from '@/lib/whot'
import { currentTurnPlayerId as scrabbleCurrentTurnPlayerId } from '@/lib/scrabble-board'
import { currentPlayerId as monopolyCurrentPlayerId } from '@/lib/monopoly'
import { currentMahjongPlayerId } from '@/lib/mahjong-session'
import { currentPlayerId as crazyEightsCurrentPlayerId } from '@/lib/crazy-eights'
import { currentPlayerId as snakeLadderCurrentPlayerId } from '@/lib/snake-and-ladder'
import { currentPlayerId as yahtzeeCurrentPlayerId } from '@/lib/yahtzee'

export type PushEvent =
  | 'game_started'
  | 'lobby_reopened'
  | 'game_ended'
  | 'your_turn'
  | 'round_started'
  | 'host_player_joined'
  | 'host_idle_warning'

let configured: boolean | null = null

function configureWebPush(): boolean {
  if (configured !== null) return configured
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:hello@fateround.com'
  if (!publicKey || !privateKey) {
    configured = false
    return false
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

const PAYLOADS: Record<PushEvent, { title: string; body: string }> = {
  game_started: { title: 'Game started 🎮', body: 'The host just kicked things off — jump back in!' },
  lobby_reopened: { title: 'Play again? 🔁', body: 'The lobby reopened for another round — come back in!' },
  game_ended: { title: 'Game over 🏁', body: 'The game just ended — see how it played out.' },
  your_turn: { title: 'Your turn!', body: 'Jump back in and make your move.' },
  round_started: { title: 'New round 🔔', body: 'A new round just started — get back in!' },
  // Discovery Phase A: host-targeted pings. Copy for these is passed in as a
  // bodyOverride (name + game + count vary per push) — the fallback strings
  // here only fire if the caller forgets an override.
  host_player_joined: {
    title: '🎲 New player joined your game',
    body: 'Someone just joined your lobby — tap to open.',
  },
  host_idle_warning: {
    title: '⏳ Your lobby closes in 2 min',
    body: 'Nobody joined and no one started the game — tap to keep it open.',
  },
}

type PushPayload = {
  title: string
  body: string
  event: PushEvent
  gameCode: string
  url: string
}

function buildPayload(event: PushEvent, gameCode: string, bodyOverride?: string): PushPayload {
  const { title, body } = PAYLOADS[event]
  return {
    title,
    body: bodyOverride ?? body,
    event,
    gameCode,
    url: `/game/${gameCode}`,
  }
}

async function sendWebPush(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload
): Promise<void> {
  if (!configureWebPush() || subs.length === 0) return

  const admin = getSupabaseAdmin()
  const body = JSON.stringify(payload)
  const stale: string[] = []

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body)
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) stale.push(s.id)
      }
    })
  )

  if (stale.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', stale)
  }
}

async function sendExpoPush(tokens: { id: string; expo_push_token: string }[], payload: PushPayload): Promise<void> {
  if (tokens.length === 0) return

  const admin = getSupabaseAdmin()
  const staleTokens = await sendExpoPushMessages(
    tokens.map((t) => ({
      to: t.expo_push_token,
      title: payload.title,
      body: payload.body,
      sound: 'default',
      data: {
        event: payload.event,
        gameCode: payload.gameCode,
        url: payload.url,
      },
    }))
  )

  if (staleTokens.length > 0) {
    await admin.from('mobile_push_tokens').delete().in('expo_push_token', staleTokens)
  }
}

/**
 * Send a lifecycle notification to every device subscribed to this game. Best-effort.
 */
export async function notifyGameEvent(gameCode: string, event: PushEvent, bodyOverride?: string): Promise<void> {
  const admin = getSupabaseAdmin()
  const code = gameCode.toUpperCase()
  const payload = buildPayload(event, code, bodyOverride)

  const [{ data: webSubs }, { data: expoTokens }] = await Promise.all([
    admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('game_id', code),
    admin.from('mobile_push_tokens').select('id, expo_push_token').eq('game_id', code),
  ])

  await Promise.all([sendWebPush(webSubs ?? [], payload), sendExpoPush(expoTokens ?? [], payload)])
}

/**
 * Notify a single player (web + native) that it is their turn or another player-specific event.
 */
export async function notifyPlayerEvent(
  gameCode: string,
  playerId: string,
  event: PushEvent,
  bodyOverride?: string
): Promise<void> {
  const admin = getSupabaseAdmin()
  const code = gameCode.toUpperCase()
  const payload = buildPayload(event, code, bodyOverride)

  const [{ data: webSubs }, { data: expoTokens }] = await Promise.all([
    admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('game_id', code).eq('player_id', playerId),
    admin.from('mobile_push_tokens').select('id, expo_push_token').eq('game_id', code).eq('player_id', playerId),
  ])

  await Promise.all([sendWebPush(webSubs ?? [], payload), sendExpoPush(expoTokens ?? [], payload)])
}

/**
 * Discovery Phase A — send a directed "someone joined your Public game" push
 * to the host. Called from the players-insert path after a successful join.
 *
 * Fires only when: the joiner isn't the host, the game is still `waiting`, and
 * `is_public = true`. Deduped in-DB via `last_host_join_push_at` — at most one
 * push per 60 seconds per game so a party of four joining at once produces one
 * ping, not four.
 *
 * Reuses the existing per-player Expo/web push tokens — no new subscription
 * infra. The host's tokens live in `mobile_push_tokens` / `push_subscriptions`
 * keyed by (game_id, player_id) — same channel turn-alerts flow through.
 */
export async function maybeNotifyHostPlayerJoined(
  gameCode: string,
  joinedPlayerName: string,
  joinedPlayerId?: string | null
): Promise<void> {
  const admin = getSupabaseAdmin()
  const code = gameCode.toUpperCase()

  const { data: game } = await admin
    .from('games')
    .select('id, status, is_public, host_player_id, game_type, max_players, last_host_join_push_at')
    .eq('id', code)
    .maybeSingle()
  if (!game || game.status !== 'waiting' || game.is_public !== true || !game.host_player_id) return
  // Skip self-joins: the host taking their own seat is not a ping-worthy event.
  if (joinedPlayerId && joinedPlayerId === game.host_player_id) return

  // Rate limit: 60s per game. Read-then-CAS-write so a burst of concurrent
  // joins can only fire once — the losers see the freshly-stamped timestamp
  // and skip.
  const now = Date.now()
  const last = game.last_host_join_push_at ? new Date(game.last_host_join_push_at).getTime() : 0
  if (now - last < 60_000) return

  const nowIso = new Date(now).toISOString()
  const priorIso = game.last_host_join_push_at
  // Guard the update on the same last-push value we read — if another request
  // already advanced it, drop this push.
  const stampQuery = admin.from('games').update({ last_host_join_push_at: nowIso }).eq('id', code)
  const { data: stamped, error: stampError } = await (
    priorIso == null ? stampQuery.is('last_host_join_push_at', null) : stampQuery.eq('last_host_join_push_at', priorIso)
  ).select('id')
  if (stampError || !stamped || stamped.length === 0) return

  const [{ count }, { data: playerRows }] = await Promise.all([
    admin.from('players').select('id', { count: 'exact', head: true }).eq('game_id', code).eq('spectator', false),
    admin.from('players').select('id, name').eq('game_id', code).eq('spectator', false),
  ])
  const seated = count ?? playerRows?.length ?? 0
  const capacity = game.max_players ? `${seated}/${game.max_players}` : `${seated}`
  // Import lazily — game-type-checks is fine to reach from server code without
  // dragging the whole registry.
  const { parseGameType: parse } = await import('@/lib/game-types')
  const gameType = parse(game.game_type)
  const label = gameType.replace(/_/g, ' ')
  const body = `🎲 ${joinedPlayerName} joined your ${label} game — ${capacity} player${seated === 1 ? '' : 's'}, tap to open.`

  await notifyPlayerEvent(code, game.host_player_id, 'host_player_joined', body)
}

/** Resolve the player whose turn it is now for supported turn-based games. */
export async function resolveCurrentTurnPlayerId(gameCode: string): Promise<string | null> {
  const admin = getSupabaseAdmin()
  const code = gameCode.toUpperCase()

  const { data: game } = await admin.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game || game.status !== 'active') return null

  const gameType = parseGameType(game.game_type)

  if (isLudoGame(gameType)) {
    const { data: session } = await admin.from('ludo_sessions').select('*').eq('game_id', code).maybeSingle()
    if (!session || session.status === 'finished') return null
    return ludoCurrentPlayerId(session)
  }

  if (isTicTacToeGame(gameType)) {
    const { data: session } = await admin.from('tic_tac_toe_sessions').select('*').eq('game_id', code).maybeSingle()
    if (!session || session.status === 'finished') return null
    return ticTacToeCurrentTurnPlayerId(session)
  }

  if (isCheckersGame(gameType)) {
    const { data: session } = await admin.from('checkers_sessions').select('*').eq('game_id', code).maybeSingle()
    if (!session || session.status === 'finished') return null
    return checkersCurrentTurnPlayerId(session)
  }

  if (isAyoGame(gameType)) {
    const { data: session } = await admin.from('ayo_sessions').select('*').eq('game_id', code).maybeSingle()
    if (!session || session.status === 'finished') return null
    return ayoCurrentTurnPlayerId(session)
  }

  if (isDraughts10Game(gameType)) {
    const { data: session } = await admin.from('checkers10_sessions').select('*').eq('game_id', code).maybeSingle()
    if (!session || session.status === 'finished') return null
    return draughts10CurrentTurnPlayerId(session)
  }

  if (isChessGame(gameType)) {
    const { data: session } = await admin.from('chess_sessions').select('*').eq('game_id', code).maybeSingle()
    if (!session || session.status === 'finished') return null
    return chessCurrentTurnPlayerId(session)
  }

  if (isWhotGame(gameType)) {
    const { data: session } = await admin.from('whot_sessions').select('*').eq('game_id', code).maybeSingle()
    if (!session || session.status === 'finished') return null
    return whotCurrentPlayerId(session)
  }

  if (isScrabbleGame(gameType)) {
    const { data: session } = await admin.from('scrabble_sessions').select('*').eq('game_id', code).maybeSingle()
    if (!session || session.status === 'finished') return null
    return scrabbleCurrentTurnPlayerId(session)
  }

  if (isMonopolyGame(gameType)) {
    const { data: board } = await admin.from('monopoly_boards').select('*').eq('game_id', code).maybeSingle()
    if (!board || board.phase === 'finished') return null
    return monopolyCurrentPlayerId(board)
  }

  if (isMahjongGame(gameType)) {
    const { data: session } = await admin.from('mahjong_sessions').select('*').eq('game_id', code).maybeSingle()
    if (!session || session.phase === 'finished') return null
    return currentMahjongPlayerId(session)
  }

  if (isCrazyEightsGame(gameType)) {
    const { data: session } = await admin.from('crazy_eights_sessions').select('*').eq('game_id', code).maybeSingle()
    if (!session || session.status === 'finished') return null
    return crazyEightsCurrentPlayerId(session)
  }

  if (isSnakeAndLadderGame(gameType)) {
    const { data: session } = await admin.from('snake_ladder_sessions').select('*').eq('game_id', code).maybeSingle()
    if (!session || session.status === 'finished') return null
    return snakeLadderCurrentPlayerId(session)
  }

  if (isYahtzeeGame(gameType)) {
    const { data: session } = await admin.from('yahtzee_sessions').select('*').eq('game_id', code).maybeSingle()
    if (!session || session.status === 'finished') return null
    return yahtzeeCurrentPlayerId(session)
  }

  return null
}

/** After a turn change, notify the player whose turn it is now (best-effort, non-blocking). */
export function scheduleTurnNotification(gameCode: string): void {
  after(async () => {
    try {
      const playerId = await resolveCurrentTurnPlayerId(gameCode)
      if (!playerId) return
      await notifyPlayerEvent(gameCode, playerId, 'your_turn')
    } catch (err) {
      console.error(`push notify (your_turn) failed for ${gameCode}`, err)
    }
  })
}

/** Notify the whole room that a new round started (e.g. trivia). */
export function scheduleRoundStartedNotification(gameCode: string, roundNumber?: number): void {
  after(async () => {
    try {
      const body = typeof roundNumber === 'number' ? `Round ${roundNumber} is live — jump back in!` : undefined
      await notifyGameEvent(gameCode, 'round_started', body)
    } catch (err) {
      console.error(`push notify (round_started) failed for ${gameCode}`, err)
    }
  })
}
