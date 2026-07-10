import { useCallback, useEffect, useRef, useState } from 'react'
import type { Game, Player } from '@fateround/shared'
import { normalizeGameCode } from '@fateround/shared'
import { joinGame } from '@/lib/api'
import { getPlayerSession, setPlayerSession } from '@/lib/secure-session'
import { getSupabase, GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase'

export type UseGameViewBootstrapOptions<Screen extends string, GameState> = {
  gameCode: string
  loadingScreen: Screen
  notFoundScreen: Screen
  joinScreen: Screen
  waitingScreen: Screen
  loadGameState: (game: Game, players: Player[]) => Promise<{ state: GameState; ok: boolean }>
  computeScreen: (game: Game, playerId: string | null, state: GameState) => Screen
  afterResolve?: (game: Game, playerId: string | null, state: GameState) => void | Promise<void>
}

export function useGameViewBootstrap<Screen extends string, GameState>(
  opts: UseGameViewBootstrapOptions<Screen, GameState>
) {
  const {
    gameCode,
    loadingScreen,
    notFoundScreen,
    joinScreen,
    waitingScreen,
    loadGameState,
    computeScreen,
    afterResolve,
  } = opts

  const code = normalizeGameCode(gameCode)
  const [screen, setScreen] = useState<Screen>(loadingScreen)
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myResumeToken, setMyResumeToken] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<boolean> => {
    try {
      const supabase = getSupabase()
      const [gameRes, playersRes] = await Promise.all([
        supabase.from('games').select(GAME_SELECT).eq('id', code).maybeSingle(),
        supabase.from('players').select(PLAYER_SELECT).eq('game_id', code).order('joined_at'),
      ])

      if (gameRes.error || playersRes.error) return false

      const gameData = gameRes.data as Game | null
      const playerRows = (playersRes.data ?? []) as Player[]

      if (!gameData) {
        setGame(null)
        setPlayers([])
        setScreen(notFoundScreen)
        return true
      }

      const { state, ok } = await loadGameState(gameData, playerRows)
      if (!ok) return false

      setGame(gameData)
      setPlayers(playerRows)
      setGameState(state)

      const session = await getPlayerSession(code)
      const playerId = session?.playerId ?? null
      if (session) {
        setMyPlayerId(session.playerId)
        setMyResumeToken(session.resumeToken)
        setJoinName(session.playerName)
      } else {
        setMyPlayerId(null)
        setMyResumeToken(null)
      }

      if (afterResolve) await afterResolve(gameData, playerId, state)
      setScreen(computeScreen(gameData, playerId, state))
      return true
    } catch {
      return false
    }
  }, [afterResolve, code, computeScreen, loadGameState, notFoundScreen])

  const join = useCallback(
    async (name?: string) => {
      const playerName = (name ?? joinName).trim()
      if (!playerName) {
        setError('Enter your name to join')
        return
      }

      setJoining(true)
      setError(null)
      try {
        const existing = await getPlayerSession(code)
        const data = await joinGame({
          gameCode: code,
          playerName,
          resumeToken: existing?.resumeToken ?? undefined,
        })

        const gender = data.playerGender ?? 'both'
        await setPlayerSession(code, data.playerId, data.playerName, gender, data.resumeToken ?? null)
        setMyPlayerId(data.playerId)
        setMyResumeToken(data.resumeToken ?? null)
        setJoinName(data.playerName)
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to join')
      } finally {
        setJoining(false)
      }
    },
    [code, joinName, load]
  )

  useEffect(() => {
    void load()
  }, [load])

  return {
    code,
    screen,
    setScreen,
    game,
    players,
    gameState,
    myPlayerId,
    myResumeToken,
    joinName,
    setJoinName,
    joining,
    error,
    load,
    join,
    joinScreen,
    waitingScreen,
  }
}

type WatchedTable = string | { table: string; column?: string }

export function useGameTableSync(
  gameCode: string,
  tables: readonly WatchedTable[],
  reload: () => void | Promise<unknown>,
  enabled = true
) {
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  useEffect(() => {
    if (!enabled || !gameCode || tables.length === 0) return

    const supabase = getSupabase()
    const norm = tables.map((t) =>
      typeof t === 'string' ? { table: t, column: 'game_id' } : { table: t.table, column: t.column ?? 'game_id' }
    )

    let debounce: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        void Promise.resolve()
          .then(() => reloadRef.current())
          .catch(() => {})
      }, 90)
    }

    let channel = supabase.channel(`sync-${gameCode}`)
    for (const { table, column } of norm) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `${column}=eq.${gameCode}` },
        () => schedule()
      )
    }

    channel.subscribe()

    return () => {
      if (debounce) clearTimeout(debounce)
      void supabase.removeChannel(channel)
    }
  }, [enabled, gameCode, tables])
}
