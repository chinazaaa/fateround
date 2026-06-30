'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { supabasePollOk } from '@/hooks/usePolling'
import { resolvePlayerSession } from '@/lib/player-resume'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { setPlayerSession } from '@/lib/utils'
import type { Game, Player } from '@/types'

/**
 * The load/screen/join scaffold that ~17 game player-views re-implement identically:
 * fetch the game + players, resolve this device's player session, then derive the screen
 * from game status. Only the game-specific session/state fetch and the status→screen
 * mapping differ, so those are passed in as `loadGameState` / `computeScreen`.
 *
 * The view keeps its own game-specific state (e.g. `session`, `playerStates`) and sets it
 * inside `loadGameState`, returning the slice `computeScreen` needs plus the fetch's
 * `ok` flag (so the polling fallback can back off on a failed read, preserving behaviour).
 *
 * Memoise `loadGameState` / `computeScreen` (useCallback) so `load` is stable.
 */
export interface UseGameViewBootstrapOptions<Screen extends string, GameState> {
  gameCode: string
  /** screen shown before the first load resolves, e.g. 'loading'. */
  loadingScreen: Screen
  /** screen shown when the game id doesn't exist, e.g. 'not_found'. */
  notFoundScreen: Screen
  /** Fetch + set the game-specific session/state; return the slice for `computeScreen`
   *  and whether the read succeeded (for poll back-off). */
  loadGameState: (game: Game, players: Player[]) => Promise<{ state: GameState; ok: boolean }>
  /** Map game status (+ resolved player + game state) to a screen. */
  computeScreen: (game: Game, playerId: string | null, state: GameState) => Screen
  /** Extra fields merged into the join POST body (e.g. room-member identity). */
  joinExtras?: Record<string, unknown>
  /** Called with the API error message when a join fails. */
  onJoinError?: (message: string) => void
}

export interface UseGameViewBootstrapResult<Screen extends string> {
  screen: Screen
  setScreen: (s: Screen) => void
  game: Game | null
  setGame: React.Dispatch<React.SetStateAction<Game | null>>
  players: Player[]
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>
  myPlayerId: string | null
  setMyPlayerId: React.Dispatch<React.SetStateAction<string | null>>
  myResumeToken: string | null
  setMyResumeToken: React.Dispatch<React.SetStateAction<string | null>>
  joinName: string
  setJoinName: React.Dispatch<React.SetStateAction<string>>
  joining: boolean
  /** Re-fetch everything and recompute the screen. Returns false if a read failed. */
  load: () => Promise<boolean>
  /** Join the game with `name` (defaults to `joinName`); on active games joins as a viewer
   *  unless `joinAsViewer` is overridden. */
  join: (opts?: { joinAsViewer?: boolean; name?: string }) => Promise<void>
}

export function useGameViewBootstrap<Screen extends string, GameState>(
  opts: UseGameViewBootstrapOptions<Screen, GameState>
): UseGameViewBootstrapResult<Screen> {
  const { gameCode, loadingScreen, notFoundScreen, loadGameState, computeScreen, joinExtras, onJoinError } = opts

  const [screen, setScreen] = useState<Screen>(loadingScreen)
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myResumeToken, setMyResumeToken] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (!supabasePollOk(gameRes, plrsRes)) return false

    const gameData = gameRes.data as Game | null
    const plrs = (plrsRes.data ?? []) as Player[]

    if (!gameData) {
      // Clear any cached state from a prior successful load so consumers don't render
      // (or `join()` branch on) a stale game once it's gone.
      setGame(null)
      setPlayers([])
      setMyPlayerId(null)
      setMyResumeToken(null)
      setScreen(notFoundScreen)
      return true
    }

    setGame(gameData)
    setPlayers(plrs)

    const { state, ok } = await loadGameState(gameData, plrs)

    const playerSession = await resolvePlayerSession(gameCode, plrs)
    const playerId = playerSession?.playerId ?? null
    setMyPlayerId(playerId)
    setMyResumeToken(playerSession?.resumeToken ?? null)

    setScreen(computeScreen(gameData, playerId, state))
    return ok
  }, [gameCode, loadingScreen, notFoundScreen, loadGameState, computeScreen])

  useEffect(() => {
    void load()
  }, [load])

  const join = useCallback(
    async (joinOpts?: { joinAsViewer?: boolean; name?: string }) => {
      const name = (joinOpts?.name ?? joinName).trim()
      if (!name) return
      setJoining(true)
      try {
        const res = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameCode,
            playerName: name,
            ...joinExtras,
            ...(game?.status === 'active' ? { joinAsViewer: joinOpts?.joinAsViewer ?? true } : {}),
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          onJoinError?.(data.error ?? 'Failed to join')
          return
        }
        setPlayerSession(gameCode, data.playerId, data.playerName, 'both', data.resumeToken)
        setMyPlayerId(data.playerId)
        setMyResumeToken(data.resumeToken ?? null)
        await load()
      } catch {
        // Network failure / non-JSON body throws before the HTTP-status check above —
        // surface it through the documented error callback rather than rejecting silently.
        onJoinError?.('Failed to join')
      } finally {
        setJoining(false)
      }
    },
    [gameCode, joinName, joinExtras, game?.status, onJoinError, load]
  )

  return {
    screen,
    setScreen,
    game,
    setGame,
    players,
    setPlayers,
    myPlayerId,
    setMyPlayerId,
    myResumeToken,
    setMyResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    join,
  }
}
