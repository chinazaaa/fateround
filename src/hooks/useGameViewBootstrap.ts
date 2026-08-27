'use client'

import { hostHref, takeOverHosting } from '@/lib/take-over-hosting'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { supabasePollOk } from '@/hooks/usePolling'
import { resolvePlayerSession } from '@/lib/player-resume'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { getPlayerSession, setPlayerSession } from '@/lib/utils'
import { currentTournamentPlayerToken } from '@/lib/tournament-player-token'
import { trackEvent, GA_EVENTS } from '@/lib/analytics'
import { authHeaders } from '@/lib/auth-headers'
import type { Game, Player } from '@/types'

/** How long an in-flight load may run before a new caller is allowed to supersede it.
 *  Comfortably longer than a slow-but-real read, short enough that a returning player
 *  isn't left staring at a spinner. */
const STALE_LOAD_MS = 12_000

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
  /** Run playerId-dependent side effects after the session resolves but before the
   *  screen is computed — e.g. load this player's bingo card, restore a saved draft,
   *  or sync mid-turn optimistic state. `loadGameState` runs *before* resolution and
   *  so lacks `playerId`; this seam fills that gap. Return an enriched `GameState` to
   *  hand `computeScreen` (for screens that depend on data only fetchable once the
   *  player is known); return nothing to keep the `loadGameState` state unchanged. */
  afterResolve?: (game: Game, playerId: string | null, state: GameState) => void | GameState | Promise<void | GameState>
  /** Extra fields merged into the join POST body (e.g. room-member identity). */
  joinExtras?: Record<string, unknown>
  /** Called with the API error message when a join fails. */
  onJoinError?: (message: string) => void
  /** Called after a successful join with the raw `/api/players` response, after the
   *  session is persisted and `myPlayerId`/`myResumeToken` are set but before the
   *  reload — for custom post-join side effects (a "Joined as X" toast, a returned
   *  role, etc.) beyond the standard session persistence. */
  onJoinSuccess?: (data: JoinResponse) => void
}

/** Shape of the `/api/players` POST response the hook relies on. Game-specific routes
 *  add extra keys (e.g. `codewordsRole`), surfaced via the index signature. */
export interface JoinResponse {
  playerId: string
  playerName: string
  resumeToken?: string
  playerGender?: string
  [key: string]: unknown
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
  /** True after a join was refused for a full lobby — cue to offer "watch instead". */
  lobbyFull: boolean
  /** Re-fetch everything and recompute the screen. Returns false if a read failed. */
  load: () => Promise<boolean>
  /** Join the game with `name` (defaults to `joinName`); on active games joins as a viewer
   *  unless `joinAsViewer` is overridden. */
  join: (opts?: { joinAsViewer?: boolean; name?: string }) => Promise<void>
}

export function useGameViewBootstrap<Screen extends string, GameState>(
  opts: UseGameViewBootstrapOptions<Screen, GameState>
): UseGameViewBootstrapResult<Screen> {
  const {
    gameCode,
    loadingScreen,
    notFoundScreen,
    loadGameState,
    computeScreen,
    afterResolve,
    joinExtras,
    onJoinError,
    onJoinSuccess,
  } = opts

  const [screen, setScreen] = useState<Screen>(loadingScreen)
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myResumeToken, setMyResumeToken] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  // Set when a join is turned away because the lobby has no open seats. Lets the join
  // screen offer "watch instead" (a spectator join) rather than a dead end.
  const [lobbyFull, setLobbyFull] = useState(false)
  // Tournament rooms are opened via a ?tournament= link; the player's secret token
  // (saved at tournament join) rides along so the server seats/reclaims only them.
  const tournamentToken = currentTournamentPlayerToken()

  // Singleflight + finished-latch. Several transports call load() during the active→finished
  // window (games realtime channel, roster poll, timer expiry, in-flight submits). Without
  // coalescing they interleave setStates and the results screen flickers; without the latch a
  // read-replica still returning the pre-finish `active` row bounces it back to the board.
  const loadingRef = useRef(false)
  const pendingRef = useRef(false)
  // When the in-flight load started, and which generation it belongs to. iOS Safari
  // suspends in-flight fetches when the tab goes to the background and, on return, some
  // of them neither resolve nor reject — the promise is simply abandoned. That left
  // `loadingRef` latched true forever, so every later load() (the visibility refresh, the
  // realtime fallback poll, a timer) returned early as "already loading" and the view sat
  // on its loading spinner until the user reloaded the page by hand. A load that has been
  // running longer than STALE_LOAD_MS is therefore treated as abandoned: the generation is
  // bumped (so the zombie can no longer release the latch or set state) and a fresh load
  // starts.
  const loadStartedAtRef = useRef(0)
  const loadGenRef = useRef(0)
  // Keyed on the session that finished. `start` only moves a game to 'active' from 'waiting'
  // with a NEW session_started_at, so a later read showing the SAME session as 'active' can
  // only be replica lag — ignore it. A real replay passes through 'waiting' (clears the latch).
  const finishedSessionRef = useRef<string | null | undefined>(undefined)

  const runLoad = useCallback(
    async (gen: number): Promise<boolean> => {
      // True once this run has been superseded by a fresher one (see loadGenRef). A zombie
      // fetch that finally settles must not write its stale snapshot over newer state.
      const superseded = () => gen !== loadGenRef.current

      // NOTE: `loadGameState` is the view's own fetch and sets the view's own state, so a run
      // already inside it can still commit late — guarding that would mean threading the
      // generation through all ~17 views. Everything this hook owns is guarded below, which
      // bounds the stale window to that one call.

      const [gameRes, plrsRes] = await Promise.all([
        supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
        supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      ])
      if (superseded()) return true
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

      setGame(gameData)
      setPlayers(plrs)

      const { state, ok } = await loadGameState(gameData, plrs)
      // Every await below is a point where a fresher load can overtake this one, so re-check
      // before each commit rather than only before setScreen: a zombie that resolves late
      // would otherwise leave its stale session behind the newer run's screen.
      if (superseded()) return ok

      const playerSession = await resolvePlayerSession(gameCode, plrs)
      if (superseded()) return ok
      const playerId = playerSession?.playerId ?? null
      setMyPlayerId(playerId)
      setMyResumeToken(playerSession?.resumeToken ?? null)

      // Post-resolve seam: run playerId-dependent side effects and optionally enrich the
      // state slice handed to computeScreen (undefined return => keep the loadGameState state).
      let effectiveState = state
      if (afterResolve) {
        try {
          const patched = await afterResolve(gameData, playerId, state)
          if (patched !== undefined) effectiveState = patched
        } catch (err) {
          // A throwing afterResolve must not leave the hook stuck on the loading screen
          // (or reject as an unhandled promise) — fall back to the loadGameState state and
          // still compute + set the screen so bootstrap always completes.
          console.error('useGameViewBootstrap: afterResolve failed', err)
        }
      }

      if (superseded()) return ok
      setScreen(computeScreen(gameData, playerId, effectiveState))
      return ok
    },
    [gameCode, notFoundScreen, loadGameState, computeScreen, afterResolve]
  )

  const load = useCallback(async (): Promise<boolean> => {
    // Coalesce overlapping calls: while one runs, extra callers flag a single trailing re-run
    // so we still settle on the freshest snapshot instead of racing N interleaved loads.
    if (loadingRef.current && Date.now() - loadStartedAtRef.current < STALE_LOAD_MS) {
      pendingRef.current = true
      return true
    }
    // Either nothing is running, or what's running has been stuck past the deadline and is
    // abandoned. Bumping the generation orphans the stuck run: its `finally` can no longer
    // clear the latch out from under this one, and its state writes are dropped.
    const gen = ++loadGenRef.current
    loadingRef.current = true
    loadStartedAtRef.current = Date.now()
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
  }, [runLoad])

  useEffect(() => {
    void load()
  }, [load])

  // Re-read whenever the tab comes back to the foreground. A backgrounded tab loses its
  // realtime socket (and, on iOS, any in-flight fetch), so without this the view can come
  // back showing a snapshot from before the switch — or, for the several views that run no
  // fallback poll at all, never come back at all. `pageshow` covers the bfcache restore
  // that fires no visibilitychange.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      void load()
    }
    const onPageShow = () => refresh()
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [load])

  const join = useCallback(
    async (joinOpts?: { joinAsViewer?: boolean; name?: string }) => {
      const name = (joinOpts?.name ?? joinName).trim()
      if (!name) return
      setJoining(true)
      try {
        // If this device already holds a seat here (reconnect / refresh / new tab), send its
        // resume token so the server reclaims that exact row — role and all — instead of
        // creating a fresh one. On an active game a fresh row defaults to spectator, which is
        // how a real player gets silently demoted to a viewer after a network blip.
        const existingToken = getPlayerSession(gameCode)?.resumeToken ?? null
        const doJoin = async (continueOnThisDevice: boolean) =>
          fetch('/api/players', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify({
              gameCode,
              playerName: name,
              ...joinExtras,
              ...(tournamentToken ? { tournamentToken } : {}),
              ...(existingToken ? { resumeToken: existingToken } : {}),
              ...(continueOnThisDevice ? { continueOnThisDevice: true } : {}),
              // An explicit choice (e.g. "watch instead" on a full lobby) wins in any state;
              // otherwise active games still default a fresh join to viewer.
              ...(joinOpts?.joinAsViewer !== undefined
                ? { joinAsViewer: joinOpts.joinAsViewer }
                : game?.status === 'active'
                  ? { joinAsViewer: true }
                  : {}),
            }),
          })
        let res = await doJoin(false)
        let data = await res.json()
        if (res.status === 409 && (data?.reason === 'already_hosting' || data?.reason === 'already_joined')) {
          // Cross-device continuation prompt: same profile already hosting or
          // seated from another device. Ask the user; on confirm re-issue the
          // join with the override flag.
          // Hosting is a different offer from continuing a seat. Retrying the join would
          // seat the host as an ordinary PLAYER and leave hosting on the other device —
          // which is not what "continue on this device" reads as. Move hosting instead.
          if (data.reason === 'already_hosting') {
            const takeOver =
              typeof window !== 'undefined' &&
              window.confirm('You’re hosting this game on another device. Take over hosting on this device?')
            if (!takeOver) return
            const token = await takeOverHosting(gameCode)
            if (token) {
              window.location.href = hostHref(gameCode)
              return
            }
            // Handoff unavailable (a failed request, or the profile no longer owns this game).
            // STOP here rather than falling through: the next branch says "you're already a
            // player on another device", which is false for a host, and confirming it would
            // seat them as an ordinary player in the game they are running.
            onJoinError?.('Could not take over hosting on this device. Try again.')
            return
          }
          const message = `You’re already a player in this game on another device${
            data.existingPlayerName ? ` (as ${data.existingPlayerName})` : ''
          }. Continue on this device, or keep it on the other one?`
          const proceed = typeof window !== 'undefined' && window.confirm(message)
          if (!proceed) {
            return
          }
          res = await doJoin(true)
          data = await res.json()
        }
        if (!res.ok) {
          setLobbyFull(data?.full === true)
          onJoinError?.(data.error ?? 'Failed to join')
          // Refresh the room snapshot so the picker sees whatever changed between the
          // caller's last render and this rejection — e.g. a not-ready player claiming the
          // same monopoly token in the seconds before we hit submit. Without this reload
          // the client keeps offering the token as free and the user retries the same click.
          void load()
          return
        }
        setLobbyFull(false)
        setPlayerSession(gameCode, data.playerId, data.playerName, 'both', data.resumeToken)
        setMyPlayerId(data.playerId)
        setMyResumeToken(data.resumeToken ?? null)
        // GA key event: a player joined a game via code/link (viral conversion).
        trackEvent(GA_EVENTS.joinGame)
        try {
          onJoinSuccess?.(data as JoinResponse)
        } catch (err) {
          // Isolate the success callback: a throwing onJoinSuccess must not fall into the
          // catch below and turn a completed join into a 'Failed to join' error or skip load().
          console.error('useGameViewBootstrap: onJoinSuccess failed', err)
        }
        await load()
      } catch {
        // Network failure / non-JSON body throws before the HTTP-status check above —
        // surface it through the documented error callback rather than rejecting silently.
        onJoinError?.('Failed to join')
      } finally {
        setJoining(false)
      }
    },
    [gameCode, joinName, joinExtras, tournamentToken, game?.status, onJoinError, onJoinSuccess, load]
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
    lobbyFull,
    load,
    join,
  }
}
