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
  // Discovery Phase A: host-targeted pings. Copy for these is passed in as a
  // bodyOverride (name + game + count vary per push) — the fallback strings
  // here only fire if the caller forgets an override.
  host_player_joined: {
    title: '🎲 New player joined your game',
    body: 'Someone just joined your lobby — tap to open.',
  },
  host_idle_warning: {
    title: '⏳ Your lobby closes in 2 min',
    body: 'The lobby’s been quiet for a while and the game hasn’t started — tap to keep it open.',
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
 *
 * `excludeHost` drops the host's own device from the fan-out. Every lifecycle event is
 * something the HOST just did — they tapped Start, or Play again, or End game — so pushing it
 * back at them notifies them of their own action, on the screen that already shows the result.
 * Reported as "if I'm the host and I reopen lobby I shouldn't get a notification".
 *
 * It is opt-in rather than automatic because `host_idle_warning` is addressed TO the host;
 * excluding them there would send the warning to everyone except the one person who can act
 * on it. Callers say who the message is for.
 */
export async function notifyGameEvent(
  gameCode: string,
  event: PushEvent,
  opts: { bodyOverride?: string; excludeHost?: boolean } = {}
): Promise<void> {
  const admin = getSupabaseAdmin()
  const code = gameCode.toUpperCase()
  const payload = buildPayload(event, code, opts.bodyOverride)

  // Only a host who took a seat has a push row at all (both tables key on a NOT NULL
  // player_id), so a host-only host needs no exclusion — there is nothing of theirs to skip.
  let excludeId: string | null = null
  if (opts.excludeHost) {
    const { data: game } = await admin.from('games').select('host_player_id').eq('id', code).maybeSingle()
    excludeId = game?.host_player_id ?? null
  }

  const webQuery = admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('game_id', code)
  const expoQuery = admin.from('mobile_push_tokens').select('id, expo_push_token').eq('game_id', code)
  const [{ data: webSubs }, { data: expoTokens }] = await Promise.all([
    excludeId ? webQuery.neq('player_id', excludeId) : webQuery,
    excludeId ? expoQuery.neq('player_id', excludeId) : expoQuery,
  ])

  await Promise.all([sendWebPush(webSubs ?? [], payload), sendExpoPush(expoTokens ?? [], payload)])
}

/**
 * "⏳ Your lobby closes in 2 min" — to the host, and only the host.
 *
 * This used to go out through `notifyGameEvent`, which fans out to everyone subscribed to the
 * game. So a message addressed to the host ("YOUR lobby closes") reached every seated player,
 * none of whom can keep the lobby open. Nobody loses a warning by narrowing it: both push
 * tables key on a NOT NULL player_id, so a host who never took a seat had no device row and
 * was never reachable either way.
 */
export async function notifyHostIdleWarning(gameCode: string): Promise<void> {
  const admin = getSupabaseAdmin()
  const code = gameCode.toUpperCase()
  const { data: game } = await admin.from('games').select('host_player_id').eq('id', code).maybeSingle()
  if (!game?.host_player_id) return
  await notifyPlayerEvent(code, game.host_player_id, 'host_idle_warning')
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

/**
 * The slice of the `games` row that turn resolution needs. Callers that just
 * fetched the row (every /api/<game>/* route does, to authorize the request)
 * pass it through so we don't re-read the same row per notification.
 */
export type KnownGameRow = { status: string; game_type: unknown }

/**
 * Terminal check that works across BOTH session-table shapes.
 *
 * Session tables split on the name of their terminal column: `tic_tac_toe`,
 * `checkers`, `checkers10`, `ayo` and `chess` call it `status`; `ludo`, `whot`,
 * `scrabble`, `crazy_eights`, `snake_ladder`, `yahtzee`, `monopoly_boards` and
 * `mahjong` call it `phase`. Every one of them spells the terminal value
 * `'finished'` (verified against supabase/migrations CHECK constraints).
 *
 * This used to be a per-branch `session.status === 'finished'`, which silently
 * read `undefined` on the eight phase-based tables — so once the caller started
 * passing a pre-mutation `games` row (pinned to `'active'`), nothing stopped a
 * player who had just WON from getting an "It's your turn!" push.
 */
function sessionFinished(session: { status?: unknown; phase?: unknown } | null | undefined): boolean {
  return !session || session.status === 'finished' || session.phase === 'finished'
}

/** Resolve the player whose turn it is now for supported turn-based games. */
export async function resolveCurrentTurnPlayerId(gameCode: string, knownGame?: KnownGameRow): Promise<string | null> {
  const admin = getSupabaseAdmin()
  const code = gameCode.toUpperCase()

  // Reuse the caller's already-fetched game row when provided. This path runs
  // at the server ticker's rate (expire-turn routes fire every few seconds per
  // active game), so re-reading `games` here doubled the games-table read
  // volume. The fallback fetch keeps callers without the row working.
  // The Supabase client is untyped, so `KnownGameRow` enforces nothing at
  // runtime. Only trust a passed row that actually carries a string status —
  // anything else falls through to the fetch rather than being read as
  // "not active" and silently swallowing the notification.
  const trustedKnownGame = knownGame && typeof knownGame.status === 'string' ? knownGame : null
  const game =
    trustedKnownGame ?? (await admin.from('games').select('status, game_type').eq('id', code).maybeSingle()).data
  if (!game || game.status !== 'active') return null

  const gameType = parseGameType(game.game_type)

  if (isLudoGame(gameType)) {
    const { data: session } = await admin.from('ludo_sessions').select('*').eq('game_id', code).maybeSingle()
    if (sessionFinished(session)) return null
    return ludoCurrentPlayerId(session)
  }

  if (isTicTacToeGame(gameType)) {
    const { data: session } = await admin.from('tic_tac_toe_sessions').select('*').eq('game_id', code).maybeSingle()
    if (sessionFinished(session)) return null
    return ticTacToeCurrentTurnPlayerId(session)
  }

  if (isCheckersGame(gameType)) {
    const { data: session } = await admin.from('checkers_sessions').select('*').eq('game_id', code).maybeSingle()
    if (sessionFinished(session)) return null
    return checkersCurrentTurnPlayerId(session)
  }

  if (isAyoGame(gameType)) {
    const { data: session } = await admin.from('ayo_sessions').select('*').eq('game_id', code).maybeSingle()
    if (sessionFinished(session)) return null
    return ayoCurrentTurnPlayerId(session)
  }

  if (isDraughts10Game(gameType)) {
    const { data: session } = await admin.from('checkers10_sessions').select('*').eq('game_id', code).maybeSingle()
    if (sessionFinished(session)) return null
    return draughts10CurrentTurnPlayerId(session)
  }

  if (isChessGame(gameType)) {
    const { data: session } = await admin.from('chess_sessions').select('*').eq('game_id', code).maybeSingle()
    if (sessionFinished(session)) return null
    return chessCurrentTurnPlayerId(session)
  }

  if (isWhotGame(gameType)) {
    const { data: session } = await admin.from('whot_sessions').select('*').eq('game_id', code).maybeSingle()
    if (sessionFinished(session)) return null
    return whotCurrentPlayerId(session)
  }

  if (isScrabbleGame(gameType)) {
    const { data: session } = await admin.from('scrabble_sessions').select('*').eq('game_id', code).maybeSingle()
    if (sessionFinished(session)) return null
    return scrabbleCurrentTurnPlayerId(session)
  }

  if (isMonopolyGame(gameType)) {
    const { data: board } = await admin.from('monopoly_boards').select('*').eq('game_id', code).maybeSingle()
    if (sessionFinished(board)) return null
    return monopolyCurrentPlayerId(board)
  }

  if (isMahjongGame(gameType)) {
    const { data: session } = await admin.from('mahjong_sessions').select('*').eq('game_id', code).maybeSingle()
    if (sessionFinished(session)) return null
    return currentMahjongPlayerId(session)
  }

  if (isCrazyEightsGame(gameType)) {
    const { data: session } = await admin.from('crazy_eights_sessions').select('*').eq('game_id', code).maybeSingle()
    if (sessionFinished(session)) return null
    return crazyEightsCurrentPlayerId(session)
  }

  if (isSnakeAndLadderGame(gameType)) {
    const { data: session } = await admin.from('snake_ladder_sessions').select('*').eq('game_id', code).maybeSingle()
    if (sessionFinished(session)) return null
    return snakeLadderCurrentPlayerId(session)
  }

  if (isYahtzeeGame(gameType)) {
    const { data: session } = await admin.from('yahtzee_sessions').select('*').eq('game_id', code).maybeSingle()
    if (sessionFinished(session)) return null
    return yahtzeeCurrentPlayerId(session)
  }

  return null
}

/** After a turn change, notify the player whose turn it is now (best-effort, non-blocking). */
export function scheduleTurnNotification(gameCode: string, knownGame?: KnownGameRow): void {
  after(async () => {
    try {
      const playerId = await resolveCurrentTurnPlayerId(gameCode, knownGame)
      if (!playerId) return
      await notifyPlayerEvent(gameCode, playerId, 'your_turn')
    } catch (err) {
      console.error(`push notify (your_turn) failed for ${gameCode}`, err)
    }
  })
}

/**
 * REMOVED: a per-round "New round 🔔" push.
 *
 * It fired once per question, so a 10-round trivia game sent ten notifications in about two
 * minutes — and often twice per round, because every connected client polls `/trivia/advance`
 * and whichever call won the race scheduled its own push. Room-wide pushes are worth it at the
 * edges of a game (it started, the lobby reopened, it ended); mid-game they are just noise to
 * players who are already looking at the screen. `your_turn` stays: it is per-player and
 * actionable. Don't reintroduce a per-round broadcast without per-recipient rate limiting.
 */
