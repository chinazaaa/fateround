import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { markGameFinished } from '@/lib/game-finish'
import type { PingPongSession } from '@/types'

export const PING_PONG_MIN_PLAYERS = 2
export const PING_PONG_MAX_PLAYERS = 2
export const PING_PONG_DEFAULT_MAX_PLAYERS = 2

export const PING_PONG_POINTS_OPTIONS = [3, 5, 7, 11, 15, 21] as const
export const PING_PONG_DEFAULT_POINTS = 7

export function clampPingPongPoints(value: unknown): number {
  const n = Number(value)
  return (PING_PONG_POINTS_OPTIONS as readonly number[]).includes(n) ? n : PING_PONG_DEFAULT_POINTS
}

export function pingPongServingSide(scoreX: number, scoreO: number, pointsToWin: number): 'X' | 'O' {
  const total = scoreX + scoreO
  const deuce = scoreX >= pointsToWin - 1 && scoreO >= pointsToWin - 1
  return deuce ? (total % 2 === 0 ? 'X' : 'O') : total % 4 < 2 ? 'X' : 'O'
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

/** True when the host can reset the room for another round. */
export async function canPingPongPlayAgain(
  supabase: SupabaseClient,
  gameId: string,
  gameStatus: string
): Promise<boolean> {
  if (gameStatus === 'waiting' || gameStatus === 'finished') return true
  if (gameStatus !== 'active') return false

  const { data: session } = await supabase
    .from('ping_pong_sessions')
    .select('status')
    .eq('game_id', gameId)
    .maybeSingle()

  return session?.status === 'finished'
}

export function isPingPongResultsPhase(
  gameStatus: string | undefined,
  session: Pick<PingPongSession, 'status' | 'winner_player_id'> | null | undefined
): boolean {
  if (!gameStatus || gameStatus === 'waiting') return false
  if (gameStatus === 'finished') return true
  if (!session) return false
  return session.status === 'finished' || !!session.winner_player_id
}

export async function initializePingPongGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  if (playerIds.length !== PING_PONG_MIN_PLAYERS) {
    return { error: `Need exactly ${PING_PONG_MIN_PLAYERS} players to start` }
  }

  const { data: existing } = await supabase
    .from('ping_pong_sessions')
    .select('player_x_id, player_o_id, updated_at')
    .eq('game_id', gameId)
    .maybeSingle()

  let playerXId: string
  let playerOId: string

  if (existing) {
    // Rematch: swap X/O so players alternate sides
    playerXId = existing.player_o_id
    playerOId = existing.player_x_id
    if (!playerIds.includes(playerXId) || !playerIds.includes(playerOId)) {
      ;[playerXId, playerOId] = shuffle(playerIds)
    }
  } else {
    ;[playerXId, playerOId] = shuffle(playerIds)
  }

  if (!playerXId || !playerOId) return { error: 'Need exactly 2 players to start' }

  const { data: gameRow } = await supabase
    .from('games')
    .select('ping_pong_points_to_win')
    .eq('id', gameId)
    .maybeSingle()
  const pointsToWin = gameRow?.ping_pong_points_to_win ?? 7

  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const names = new Map<string, string>()
  for (const p of playerRows ?? []) names.set(p.id, p.name)

  const sessionRow = {
    player_x_id: playerXId,
    player_o_id: playerOId,
    score_x: 0,
    score_o: 0,
    points_to_win: pointsToWin,
    status: 'active' as const,
    winner_player_id: null,
    status_message: `First to ${pointsToWin} points wins (win by 2)!`,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    const { updated, error } = await persistSession(supabase, gameId, sessionRow, existing.updated_at)
    if (error) return { error }
    if (!updated) return { error: 'Failed to reset existing game session' }
    return {}
  }

  const { error } = await supabase.from('ping_pong_sessions').insert({ ...sessionRow, game_id: gameId })
  if (error) return { error: internalErrorMessage('ping-pong', error) }
  return {}
}

async function loadSession(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ session: PingPongSession | null; error?: string }> {
  const { data, error } = await supabase.from('ping_pong_sessions').select('*').eq('game_id', gameId).maybeSingle()
  if (error) return { session: null, error: internalErrorMessage('ping-pong', error) }
  return { session: data as PingPongSession | null }
}

async function persistSession(
  supabase: SupabaseClient,
  gameId: string,
  patch: Partial<PingPongSession>,
  expectedUpdatedAt?: string
): Promise<{ updated: boolean; error?: string }> {
  let query = supabase
    .from('ping_pong_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
  if (expectedUpdatedAt) {
    query = query.eq('updated_at', expectedUpdatedAt)
  }
  const { data, error } = await query.select('game_id')
  if (error) {
    return { updated: false, error: internalErrorMessage('ping-pong', error) }
  }
  return { updated: (data?.length ?? 0) > 0 }
}

export async function processPingPongPoint(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  scorer: 'X' | 'O',
  expectedRally?: number
): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.status === 'finished') return { error: 'Game already finished' }

  if (session.player_x_id !== playerId && session.player_o_id !== playerId) {
    return { error: 'You are not in this game' }
  }

  const currentRally = session.score_x + session.score_o
  if (expectedRally !== undefined && expectedRally !== currentRally) {
    return { error: 'Point event already processed or out of sequence' }
  }

  const newScoreX = scorer === 'X' ? session.score_x + 1 : session.score_x
  const newScoreO = scorer === 'O' ? session.score_o + 1 : session.score_o

  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const names = new Map<string, string>()
  for (const p of playerRows ?? []) names.set(p.id, p.name)

  const pointsToWin = session.points_to_win
  const winX = newScoreX >= pointsToWin && newScoreX - newScoreO >= 2
  const winO = newScoreO >= pointsToWin && newScoreO - newScoreX >= 2
  const finished = winX || winO

  let winnerPlayerId: string | null = null
  let statusMessage = `Point for ${names.get(scorer === 'X' ? session.player_x_id : session.player_o_id) ?? scorer}!`

  if (winX) {
    winnerPlayerId = session.player_x_id
    statusMessage = `${names.get(session.player_x_id) ?? 'Player X'} wins!`
  } else if (winO) {
    winnerPlayerId = session.player_o_id
    statusMessage = `${names.get(session.player_o_id) ?? 'Player O'} wins!`
  } else if (newScoreX >= pointsToWin - 1 && newScoreO >= pointsToWin - 1 && newScoreX === newScoreO) {
    statusMessage = `Deuce! (${newScoreX} - ${newScoreO}) — win by 2`
  }

  const { updated: won, error: persistError } = await persistSession(
    supabase,
    gameId,
    {
      score_x: newScoreX,
      score_o: newScoreO,
      status: finished ? 'finished' : 'active',
      winner_player_id: winnerPlayerId,
      status_message: statusMessage,
    },
    session.updated_at
  )
  if (persistError) return { error: persistError }
  if (!won) return { error: 'Concurrent update conflict, please retry' }

  if (finished) {
    await markGameFinished(supabase, gameId)
  }

  return {}
}

/** Play again — keep finished session so the next start can swap who opens as X. */
export async function clearPingPongSessionData(
  _supabase: SupabaseClient,
  _gameId: string
): Promise<{ error?: string }> {
  return {}
}

/**
 * Remove a player from a Ping Pong game (they left or were kicked). The game is
 * heads-up, so leaving an active game is a forfeit: the other player wins.
 */
export async function removePingPongPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerName?: string
): Promise<{ error: string | null }> {
  const { data: sessionRaw, error: sessionLoadError } = await supabase
    .from('ping_pong_sessions')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle()
  if (sessionLoadError) {
    return { error: internalErrorMessage('ping-pong', sessionLoadError) }
  }
  const session = sessionRaw as PingPongSession | null

  if (
    session &&
    session.status === 'active' &&
    (session.player_x_id === playerId || session.player_o_id === playerId)
  ) {
    const otherId = session.player_x_id === playerId ? session.player_o_id : session.player_x_id
    const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
    const names = new Map<string, string>()
    for (const p of playerRows ?? []) names.set(p.id, p.name)
    const loserName = playerName ?? names.get(playerId) ?? (session.player_x_id === playerId ? 'X' : 'O')
    const winnerName = names.get(otherId) ?? 'Opponent'

    const { data: updatedRows, error: sessionError } = await supabase
      .from('ping_pong_sessions')
      .update({
        status: 'finished',
        winner_player_id: otherId,
        status_message: `${loserName} left — ${winnerName} wins!`,
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
      .eq('status', 'active')
      .eq('updated_at', session.updated_at)
      .select('game_id')
    if (sessionError) return { error: internalErrorMessage('ping-pong', sessionError) }

    if (!updatedRows?.length) {
      const { data: reloaded } = await supabase
        .from('ping_pong_sessions')
        .select('status')
        .eq('game_id', gameId)
        .maybeSingle()
      if (reloaded?.status !== 'finished') {
        return { error: 'Concurrent update conflict during forfeit, please retry' }
      }
    } else {
      await markGameFinished(supabase, gameId)
    }

    const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
    return { error: error?.message ?? null }
  }

  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  return { error: error?.message ?? null }
}
