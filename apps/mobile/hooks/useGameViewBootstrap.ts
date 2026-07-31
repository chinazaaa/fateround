import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { normalizeGameCode } from '@fateround/shared'
import { joinGame } from '@/lib/api'
import { recordRecentGame } from '@/lib/recent-games'
import { getPlayerSession, setPlayerSession } from '@/lib/secure-session'
import { reconcilePlayerSession } from '@/lib/player-session-reconcile'
import { subscribePlayerSession } from '@/lib/session-events'
import { getSupabase, GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase'
import { uniqueTopic } from '@/lib/realtime'
import { useProfileAttribution } from '@/hooks/useProfileAttribution'

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
  // Set when a join is refused because the lobby is full — cue to offer "watch instead".
  const [lobbyFull, setLobbyFull] = useState(false)

  // The game-specific callbacks are passed as fresh literals every render by most call
  // sites. Mirror them in refs so `load` can stay referentially stable — otherwise `load`
  // changes identity each render, the mount effect below refires every render, and the
  // view spins in a continuous full-reload loop (the source of the crossword/word-search
  // input lag and the finish-screen flicker). We always call the latest closure.
  const loadGameStateRef = useRef(loadGameState)
  loadGameStateRef.current = loadGameState
  const computeScreenRef = useRef(computeScreen)
  computeScreenRef.current = computeScreen
  const afterResolveRef = useRef(afterResolve)
  afterResolveRef.current = afterResolve

  // Singleflight: overlapping load() calls (mount + realtime + submit) must not interleave
  // their setStates, which is what makes the finished screen flicker. While one load runs,
  // extra calls just flag a single trailing re-run so we still end on the freshest data.
  const loadingRef = useRef(false)
  const pendingRef = useRef(false)
  // Finished latch, keyed on the session that finished. `start` only moves a game to
  // 'active' from 'waiting' with a *new* session_started_at, so a later read that shows the
  // SAME session as 'active' can only be read-replica lag — ignore it so results never bounce
  // back to the board. A real replay passes through 'waiting' (which clears the latch).
  const finishedSessionRef = useRef<string | null | undefined>(undefined)

  const runLoad = useCallback(async (): Promise<boolean> => {
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

      // Stale-replica guard (see finishedSessionRef above).
      if (
        finishedSessionRef.current !== undefined &&
        gameData.status === 'active' &&
        (gameData.session_started_at ?? null) === finishedSessionRef.current
      ) {
        return true
      }
      if (gameData.status === 'finished') finishedSessionRef.current = gameData.session_started_at ?? null
      else if (gameData.status === 'waiting') finishedSessionRef.current = undefined

      const { state, ok } = await loadGameStateRef.current(gameData, playerRows)

      setGame(gameData)
      setPlayers(playerRows)
      setGameState(ok ? state : null)

      // Reconcile the stored session against the roster we just fetched: a drifted/
      // stale player id (removed+rejoined, reclaim miss, rotated token) otherwise
      // sticks forever and mismatches the dealt hand ("Your hand (0)"). Heals via
      // the server's token-keyed resume, clears only on a confirmed 404. Web does
      // this via resolvePlayerSession; mobile never had it.
      const session = await reconcilePlayerSession(code, playerRows)
      const playerId = session?.playerId ?? null
      if (session) {
        setMyPlayerId(session.playerId)
        setMyResumeToken(session.resumeToken)
        setJoinName(session.playerName)
        void recordRecentGame({
          code,
          title: gameData.title,
          gameType: gameData.game_type,
        })
      } else {
        setMyPlayerId(null)
        setMyResumeToken(null)
      }

      const resolvedState = ok ? state : (null as GameState)
      if (afterResolveRef.current) await afterResolveRef.current(gameData, playerId, resolvedState)
      setScreen(computeScreenRef.current(gameData, playerId, resolvedState))
      return true
    } catch {
      return false
    }
  }, [code, notFoundScreen])

  const load = useCallback(async (): Promise<boolean> => {
    if (loadingRef.current) {
      pendingRef.current = true
      return true
    }
    loadingRef.current = true
    try {
      let ok = await runLoad()
      while (pendingRef.current) {
        pendingRef.current = false
        ok = await runLoad()
      }
      return ok
    } finally {
      loadingRef.current = false
    }
  }, [runLoad])

  const join = useCallback(
    async (
      name?: string,
      options?: {
        joinAsViewer?: boolean
        participantId?: string
        gender?: import('@fateround/shared').PlayerGender
        identityGender?: import('@fateround/shared').ParticipantGender
        pollGender?: import('@fateround/shared').ParticipantGender
      }
    ) => {
      const playerName = (name ?? joinName).trim()
      if (!playerName && !options?.participantId) {
        setError('Enter your name to join')
        return
      }

      setJoining(true)
      setError(null)
      try {
        const existing = await getPlayerSession(code)
        const data = await joinGame({
          gameCode: code,
          playerName: playerName || 'Player',
          resumeToken: existing?.resumeToken ?? undefined,
          joinAsViewer: options?.joinAsViewer,
          participantId: options?.participantId,
          gender: options?.gender,
          identityGender: options?.identityGender,
          pollGender: options?.pollGender,
        })

        const gender = data.playerGender ?? 'both'
        await setPlayerSession(code, data.playerId, data.playerName, gender, data.resumeToken ?? null)
        setMyPlayerId(data.playerId)
        setMyResumeToken(data.resumeToken ?? null)
        setJoinName(data.playerName)
        setLobbyFull(false)
        await load()
      } catch (err) {
        setLobbyFull((err as { full?: boolean })?.full === true)
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

  // Rotating the player code mints a new resume token; ours would otherwise stay
  // cached from bootstrap and every move would authenticate with the dead one.
  useEffect(() => {
    return subscribePlayerSession(code, () => void load())
  }, [code, load])

  // Link this player to their profile once the game is over. Best-effort and silent — see
  // the hook for why attribution happens here rather than on the finish request itself.
  useProfileAttribution({ gameCode: code, status: game?.status, resumeToken: myResumeToken })

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
    lobbyFull,
    load,
    join,
    joinScreen,
    waitingScreen,
  }
}

type WatchedTable = string | { table: string; column?: string }

// Supabase postgres_changes occasionally drops a players INSERT/UPDATE event, and the
// lobby (join / ready-up / play-again ring) has no other traffic to mask a drop the way
// active play does. Reconcile on a short poll while waiting, on top of realtime.
const LOBBY_POLL_INTERVAL_MS = 8000

export function useGameTableSync(
  gameCode: string,
  tables: readonly WatchedTable[],
  reload: () => void | Promise<unknown>,
  enabled = true,
  gameStatus?: string
) {
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  // Call sites pass a fresh `tables` array literal each render; keying the
  // effect on the serialized contents (not array identity) stops it from
  // re-subscribing every render.
  const tablesKey = JSON.stringify(tables)

  useEffect(() => {
    if (!enabled || !gameCode || tables.length === 0) return

    const supabase = getSupabase()
    const norm = tables.map((t) =>
      typeof t === 'string' ? { table: t, column: 'game_id' } : { table: t.table, column: t.column ?? 'game_id' }
    )

    // Debounce reloads so a burst of changes coalesces into one reload. But a plain reset-on-every-
    // event debounce STARVES under a sustained flood (e.g. crossword/word-search/word-scramble with
    // many players — an INSERT every ~50ms never leaves the 90ms gap the debounce needs to fire), so
    // everyone else's live progress freezes until typing pauses. Cap the total wait so a continuous
    // flood still refreshes ~2.5x/second while isolated changes keep the snappy 90ms latency.
    const MAX_WAIT_MS = 400
    let debounce: ReturnType<typeof setTimeout> | null = null
    let firstScheduledAt = 0
    const fire = () => {
      debounce = null
      firstScheduledAt = 0
      void Promise.resolve()
        .then(() => reloadRef.current())
        .catch(() => {})
    }
    const schedule = () => {
      const now = Date.now()
      if (firstScheduledAt === 0) firstScheduledAt = now
      if (debounce) clearTimeout(debounce)
      const delay = Math.min(90, Math.max(0, MAX_WAIT_MS - (now - firstScheduledAt)))
      debounce = setTimeout(fire, delay)
    }

    // (Re)build and subscribe a fresh channel. Broken out so the AppState resume
    // path can tear the old one down and start clean — see the listener below.
    const subscribe = () => {
      let channel = supabase.channel(uniqueTopic(`sync-${gameCode}`))
      for (const { table, column } of norm) {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `${column}=eq.${gameCode}` },
          () => schedule()
        )
      }
      channel.subscribe()
      return channel
    }

    let channel = subscribe()

    // While the app is backgrounded, React Native suspends JS timers and the OS
    // may silently drop the websocket; realtime-js does not reliably notice on
    // resume, so changes that landed while away never arrive. On every
    // background→active edge, drop the (possibly dead) channel, re-subscribe a
    // fresh one, and fire one reload to reconcile whatever we missed.
    let prevAppState = AppState.currentState
    const appStateSub = AppState.addEventListener('change', (state) => {
      const wasBackground = prevAppState !== 'active'
      prevAppState = state
      if (!wasBackground || state !== 'active') return
      void supabase.removeChannel(channel)
      channel = subscribe()
      void Promise.resolve()
        .then(() => reloadRef.current())
        .catch(() => {})
    })

    const pollId =
      gameStatus === 'waiting'
        ? setInterval(() => {
            void Promise.resolve()
              .then(() => reloadRef.current())
              .catch(() => {})
          }, LOBBY_POLL_INTERVAL_MS)
        : null

    return () => {
      if (debounce) clearTimeout(debounce)
      if (pollId) clearInterval(pollId)
      appStateSub.remove()
      void supabase.removeChannel(channel)
    }
    // `tables` is intentionally keyed via tablesKey (contents, not identity).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, gameCode, tablesKey, gameStatus])
}
