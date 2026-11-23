import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { normalizeGameCode } from '@fateround/shared'
import { Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { JoinError, joinGame } from '@/lib/api'
import { takeOverHosting } from '@/lib/take-over-hosting'
import { recordRecentGame } from '@/lib/recent-games'
import { getPlayerSession, setPlayerSession, type PlayerSession } from '@/lib/secure-session'
import { reconcilePlayerSession } from '@/lib/player-session-reconcile'
import { subscribePlayerSession } from '@/lib/session-events'
import { getSupabase, GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase'
import { uniqueTopic } from '@/lib/realtime'
import { useProfileAttribution } from '@/hooks/useProfileAttribution'

/** How long an in-flight load may run before a new caller supersedes it (a fetch that never settles). */
const STALE_LOAD_MS = 12_000

export type UseGameViewBootstrapOptions<Screen extends string, GameState> = {
  gameCode: string
  loadingScreen: Screen
  notFoundScreen: Screen
  joinScreen: Screen
  waitingScreen: Screen
  /**
   * Load the game-specific slice of state. `session` is the CALLER'S reconciled session for
   * this load (see runLoad) — use its `resumeToken` for any per-player server read instead of
   * reading SecureStore, so the read is never made with a stale/rotated token.
   */
  loadGameState: (
    game: Game,
    players: Player[],
    session: PlayerSession | null,
    /**
     * True while this load is still the current one. A callback that publishes game-specific state of its own
     * (setState, refs, trackers) must check it after every await and stop publishing once it turns false: the
     * hook drops a superseded run's results, but not what the callback already wrote itself.
     */
    isCurrent: () => boolean
  ) => Promise<{ state: GameState; ok: boolean }>
  computeScreen: (game: Game, playerId: string | null, state: GameState) => Screen
  afterResolve?: (
    game: Game,
    playerId: string | null,
    state: GameState,
    /** See `loadGameState`. */
    isCurrent: () => boolean
  ) => void | Promise<void>
  /**
   * When `loadGameState` reports `ok: false`, resolve the load as failed WITHOUT publishing the new game,
   * players or screen (and without running `afterResolve`): the view's own state was left as it was, so
   * showing the new game over it would pair e.g. a new round's board with the previous round's metadata. The
   * caller owns retrying. Off by default: other games render with a null state on a failed read.
   */
  holdOnLoadStateFailure?: boolean
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
    holdOnLoadStateFailure,
  } = opts

  const router = useRouter()
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
  const holdOnFailureRef = useRef(holdOnLoadStateFailure)
  holdOnFailureRef.current = holdOnLoadStateFailure

  // Singleflight: overlapping load() calls (mount + realtime + submit) must not interleave
  // their setStates, which is what makes the finished screen flicker. While one load runs,
  // extra calls just flag a single trailing re-run so we still end on the freshest data.
  const loadingRef = useRef(false)
  const pendingRef = useRef(false)
  // Settles with the final result of the load chain now running (trailing re-runs included); see loadSettled.
  const chainRef = useRef<Promise<boolean> | null>(null)
  // When the running load started, its generation, and a way to settle its chain with `false` once it is
  // superseded: a read that never settles must not leave a waiting retry hanging forever (see loadSettled).
  const loadStartedAtRef = useRef(0)
  const loadGenRef = useRef(0)
  const abandonChainRef = useRef<(() => void) | null>(null)
  // Finished latch, keyed on the session that finished. `start` only moves a game to
  // 'active' from 'waiting' with a *new* session_started_at, so a later read that shows the
  // SAME session as 'active' can only be read-replica lag — ignore it so results never bounce
  // back to the board. A real replay passes through 'waiting' (which clears the latch).
  const finishedSessionRef = useRef<string | null | undefined>(undefined)
  // True while a finished read latched the session above but its load failed under holdOnLoadStateFailure, so the
  // finished state was never published. A stale-active read of that same session must then report failure (so the
  // caller retries) instead of success, without publishing the stale active board.
  const finishedUnpublishedRef = useRef(false)

  // False between unmount and the next mount. Unmounting also bumps the generation, so a run still in flight
  // counts as superseded: its callbacks (`isCurrent`) and its own writes stop, and nobody keeps waiting on it.
  const mountedRef = useRef(true)
  const invalidateLoads = useCallback(() => {
    mountedRef.current = false
    loadGenRef.current++
    loadingRef.current = false
    pendingRef.current = false
    abandonChainRef.current?.()
    abandonChainRef.current = null
    chainRef.current = null
  }, [])
  useEffect(() => {
    mountedRef.current = true
    return invalidateLoads
  }, [invalidateLoads])

  const runLoad = useCallback(
    async (gen: number): Promise<boolean> => {
      // True once a fresher load has superseded this run: a zombie that settles late must not write over it.
      const superseded = () => gen !== loadGenRef.current
      try {
        const supabase = getSupabase()
        const [gameRes, playersRes] = await Promise.all([
          supabase.from('games').select(GAME_SELECT).eq('id', code).maybeSingle(),
          supabase.from('players').select(PLAYER_SELECT).eq('game_id', code).order('joined_at'),
        ])

        if (superseded()) return true
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
          return !finishedUnpublishedRef.current
        }
        if (gameData.status === 'finished') finishedSessionRef.current = gameData.session_started_at ?? null
        else if (gameData.status === 'waiting') {
          finishedSessionRef.current = undefined
          finishedUnpublishedRef.current = false
        }

        // Reconcile the stored session against the roster we just fetched: a drifted/
        // stale player id (removed+rejoined, reclaim miss, rotated token) otherwise
        // sticks forever and mismatches the dealt hand ("Your hand (0)"). Heals via
        // the server's token-keyed resume, clears only on a confirmed 404. Web does
        // this via resolvePlayerSession; mobile never had it.
        //
        // BEFORE loadGameState, and handed to it: game state that is fetched per-player
        // through a server route (the Codewords key card, a card hand) authenticates with
        // the resume token, so loading it against the pre-reconciliation token yields a
        // REDACTED view of a live game — a spymaster staring at an operative's grid until
        // some later event happens to reload (review on PR #787). Reading SecureStore
        // directly inside loadGameState has the same flaw and one extra keychain read.
        const session = await reconcilePlayerSession(code, playerRows, () => !superseded())
        if (superseded()) return true
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

        const { state, ok } = await loadGameStateRef.current(gameData, playerRows, session, () => !superseded())
        if (superseded()) return ok
        if (!ok && holdOnFailureRef.current) {
          if (gameData.status === 'finished') finishedUnpublishedRef.current = true
          return false
        }
        finishedUnpublishedRef.current = false

        setGame(gameData)
        setPlayers(playerRows)
        setGameState(ok ? state : null)

        const resolvedState = ok ? state : (null as GameState)
        if (afterResolveRef.current) {
          await afterResolveRef.current(gameData, playerId, resolvedState, () => !superseded())
          // A fresher load can overtake this one while afterResolve runs (e.g. it finished the game):
          // switching the screen now would put this older game snapshot back on top.
          if (superseded()) return true
        }
        setScreen(computeScreenRef.current(gameData, playerId, resolvedState))
        return true
      } catch {
        return false
      }
    },
    [code, notFoundScreen]
  )

  const load = useCallback(async (): Promise<boolean> => {
    // Unmounted: a late caller (a flip answer, a retry timer) must not start a load that publishes into nothing.
    if (!mountedRef.current) return false
    if (loadingRef.current && Date.now() - loadStartedAtRef.current < STALE_LOAD_MS) {
      pendingRef.current = true
      return true
    }
    // Nothing is running, or what is running is stuck past the deadline: orphan it (its latch release and
    // state writes are dropped) and tell whoever waits on it that it failed.
    abandonChainRef.current?.()
    const gen = ++loadGenRef.current
    loadingRef.current = true
    loadStartedAtRef.current = Date.now()
    let abandon: () => void = () => {}
    const abandoned = new Promise<boolean>((resolve) => {
      abandon = () => resolve(false)
    })
    const run = (async (): Promise<boolean> => {
      try {
        let ok = await runLoad(gen)
        while (pendingRef.current && gen === loadGenRef.current) {
          pendingRef.current = false
          loadStartedAtRef.current = Date.now()
          ok = await runLoad(gen)
        }
        return ok
      } finally {
        if (gen === loadGenRef.current) loadingRef.current = false
      }
    })()
    const chain = Promise.race([run, abandoned])
    abandonChainRef.current = abandon
    chainRef.current = chain
    return chain
  }, [runLoad])

  // Like `load`, but a call that joins a run already in flight resolves with the queued run's real outcome
  // rather than `true` straight away. For a caller that owns a retry and must know whether the read it asked
  // for actually succeeded (see createReadRetry). A run that never settles stops being waited for once stale.
  const loadSettled = useCallback((): Promise<boolean> => {
    const chain = chainRef.current
    const age = Date.now() - loadStartedAtRef.current
    let waitFor: Promise<boolean>
    let deadlineMs: number
    if (loadingRef.current && chain && age < STALE_LOAD_MS) {
      pendingRef.current = true
      waitFor = chain
      deadlineMs = Math.max(0, STALE_LOAD_MS - age)
    } else {
      // Starting the load here: it gets the same deadline, or a games query that never settles would leave
      // the caller (the flip tracker's resync) waiting forever and never owing a retry.
      waitFor = load()
      deadlineMs = STALE_LOAD_MS
    }
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), deadlineMs)
      void waitFor.then(
        (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        () => {
          clearTimeout(timer)
          resolve(false)
        }
      )
    })
  }, [load])

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

      const attemptJoin = async (continueOnThisDevice: boolean) => {
        const existing = await getPlayerSession(code)
        return joinGame({
          gameCode: code,
          playerName: playerName || 'Player',
          resumeToken: existing?.resumeToken ?? undefined,
          joinAsViewer: options?.joinAsViewer,
          participantId: options?.participantId,
          gender: options?.gender,
          identityGender: options?.identityGender,
          pollGender: options?.pollGender,
          continueOnThisDevice,
        })
      }

      setJoining(true)
      setError(null)
      try {
        let data
        try {
          data = await attemptJoin(false)
        } catch (err) {
          // Cross-device continuation prompt: same profile already hosting or
          // seated from another device. Ask the user which device wins; on
          // "Continue here" re-issue the join with the override flag.
          if (err instanceof JoinError && (err.reason === 'already_hosting' || err.reason === 'already_joined')) {
            // Hosting is a different offer from continuing a seat: retrying the join would
            // seat the host as an ordinary PLAYER and leave hosting on the other device.
            if (err.reason === 'already_hosting') {
              const takeOver = await new Promise<boolean>((resolve) => {
                Alert.alert(
                  'Hosting on another device',
                  'You’re hosting this game on another device. Take over hosting on this device?',
                  [
                    { text: 'Keep other device', style: 'cancel', onPress: () => resolve(false) },
                    { text: 'Take over here', style: 'default', onPress: () => resolve(true) },
                  ],
                  { cancelable: false }
                )
              })
              if (!takeOver) {
                setError(null)
                setJoining(false)
                return
              }
              const hostToken = await takeOverHosting(gameCode)
              if (hostToken) {
                setError(null)
                setJoining(false)
                router.replace(`/host/${gameCode.toUpperCase()}` as never)
                return
              }
              // Handoff unavailable (a failed request, or the profile no longer owns this
              // game). STOP here rather than falling through: the next prompt says "you're
              // already a player on another device", which is false for a host, and confirming
              // it would seat them as an ordinary player in the game they are running.
              setError('Could not take over hosting on this device. Try again.')
              setJoining(false)
              return
            }
            const proceed = await new Promise<boolean>((resolve) => {
              Alert.alert(
                'Already in this game elsewhere',
                `You’re already a player in this game on another device${
                  err.existingPlayerName ? ` (as ${err.existingPlayerName})` : ''
                }. Continue on this device, or keep it on the other one?`,
                [
                  { text: 'Keep other device', style: 'cancel', onPress: () => resolve(false) },
                  { text: 'Continue here', style: 'default', onPress: () => resolve(true) },
                ],
                { cancelable: false }
              )
            })
            if (!proceed) {
              setError(null)
              setJoining(false)
              return
            }
            data = await attemptJoin(true)
          } else {
            throw err
          }
        }

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
        // Refresh the room snapshot so the picker sees whatever changed between the
        // caller's last render and this rejection — e.g. a not-ready player claiming the
        // same monopoly token in the seconds before we hit submit. Without this reload
        // the client keeps offering the token as free and the user retries the same click.
        void load()
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
    loadSettled,
    join,
    joinScreen,
    waitingScreen,
  }
}

type WatchedTable =
  | string
  | {
      table: string
      column?: string
      /**
       * Delta fast-path. If provided and it returns `true` for a given row change,
       * skip the debounced reload — the caller has already merged the new row into
       * local state. Anything else (void / false / DELETE / thrown) falls through
       * to the normal reload so a bad payload never leaves the view stale.
       * Mirrors the web `useGameTableSync` contract.
       */
      apply?: (row: Record<string, unknown>) => void | boolean
    }

// Supabase postgres_changes occasionally drops a players INSERT/UPDATE event, and the
// lobby (join / ready-up / play-again ring) has no other traffic to mask a drop the way
// active play does. Reconcile on a short poll while waiting, on top of realtime.
const LOBBY_POLL_INTERVAL_MS = 8000

export function useGameTableSync(
  gameCode: string,
  tables: readonly WatchedTable[],
  reload: () => void | Promise<unknown>,
  enabled = true,
  gameStatus?: string,
  // Opt-in reconcile cadence for ACTIVE play. Realtime is primary, but a channel can stay
  // subscribed while silently dropping row changes (no status event fires), and while the app
  // is foregrounded there's otherwise no recovery — a client would sit on a stale view forever.
  // For a live clock game that means ticking the wrong player's clock and losing on time
  // without ever seeing it was your turn. Pass a slow interval (e.g. 10s) for turn/clock-critical
  // games so a stuck view self-heals. Left unset for the many-player games to avoid broad polling.
  activePollMs?: number
) {
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  // Call sites pass a fresh `tables` array literal each render; keying the
  // effect on the serialized contents (not array identity) stops it from
  // re-subscribing every render.
  const tablesKey = tables
    .map((t) => (typeof t === 'string' ? `${t}:game_id` : `${t.table}:${t.column ?? 'game_id'}`))
    .join(',')

  // `apply` callbacks change identity each render; read the latest through a ref
  // so the subscription (keyed on table names + columns) never has to be torn
  // down and rebuilt. Same trick as web useGameTableSync.
  const applyRef = useRef(new Map<string, ((row: Record<string, unknown>) => void | boolean) | undefined>())
  applyRef.current = new Map(tables.map((t) => (typeof t === 'string' ? [t, undefined] : [t.table, t.apply])))

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
          (payload: { eventType?: string; new?: Record<string, unknown> | null }) => {
            // Delta fast-path: if the caller supplied an `apply` for this
            // table and it fully absorbed the row (returned true), skip the
            // debounced reconciliation reload. DELETEs and unopted-in tables
            // still reload as before.
            const apply = applyRef.current.get(table)
            let handled = false
            if (apply && payload?.eventType !== 'DELETE' && payload?.new && Object.keys(payload.new).length > 0) {
              try {
                handled = apply(payload.new) === true
              } catch {
                handled = false
              }
            }
            if (!handled) schedule()
          }
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

    // Lobby polls at a fixed cadence; an active game polls only if the caller opted in with
    // activePollMs (turn/clock-critical games) — the safety net for a silently-stale channel.
    const pollMs = gameStatus === 'waiting' ? LOBBY_POLL_INTERVAL_MS : activePollMs
    const pollId = pollMs
      ? setInterval(() => {
          void Promise.resolve()
            .then(() => reloadRef.current())
            .catch(() => {})
        }, pollMs)
      : null

    return () => {
      if (debounce) clearTimeout(debounce)
      if (pollId) clearInterval(pollId)
      appStateSub.remove()
      void supabase.removeChannel(channel)
    }
    // `tables` is intentionally keyed via tablesKey (contents, not identity).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, gameCode, tablesKey, gameStatus, activePollMs])
}
