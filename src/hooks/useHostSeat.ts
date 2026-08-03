// src/hooks/useHostSeat.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { consumeHostPlayIntent } from '@/lib/host-play-intent'
import { getRememberedName } from '@/lib/identity-local'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import { useHostPlayerReconciliation } from '@/hooks/useHostPlayerReconciliation'

export type HostSeatMode = 'spectator' | 'player'

/**
 * The host's own seat in a game lobby: "Host + play" (join the players list) vs
 * "Host only" (spectate). This used to be copy-pasted into ~30 host views, each
 * with its own `hostMode` state, per-game localStorage key, `changeHostMode`
 * (DELETE the seat), and `hostJoinGame` (POST a player). Small drift between the
 * copies is what made the toggle "work here, not there".
 *
 * The Trivia host view is the reference implementation this centralizes.
 *
 * "Host only" in the LOBBY gives up the player seat (no row) so the host is out of
 * the players list — the lobby's `spectator` flag doubles as "not ready", so a
 * spectator row there would misread as a not-ready player. Once the game is ACTIVE,
 * a host-only host is seated as a *visible* spectator row so everyone sees the host
 * in the roster with a HOST badge.
 *
 * Seeding on mount (in priority order):
 *  1. An existing player session (`getPlayerSession`) → adopt it; mode seeds from the
 *     persisted value, then a one-time reconcile corrects it from the row's spectator flag.
 *  2. The create-screen intent (`consumeHostPlayIntent`, one-shot):
 *       - role 'host' → mode 'spectator'.
 *       - role 'play' WITH a name → mode 'player', prefill the name, and arm a
 *         one-time auto-join so the host is seated without a manual click.
 *  3. Otherwise → the per-game persisted mode (default 'player'), no auto-join.
 *
 * A player name is never invented for a PLAYING seat; the active host-only spectator
 * seat defaults to "Host" (the row carries the HOST badge, so the label reads clearly).
 */

const hostModeKey = (gameCode: string) => `host_mode_${gameCode.toUpperCase()}`

function readPersistedMode(gameCode: string): HostSeatMode {
  if (typeof window === 'undefined') return 'player'
  return localStorage.getItem(hostModeKey(gameCode)) === 'spectator' ? 'spectator' : 'player'
}

/** The host's chosen seat mode ('player' = Host + play, 'spectator' = Host only), read
 *  from the same persisted store `useHostSeat` writes. Lets other host hooks respect a
 *  deliberate "Host only" choice (e.g. so auto-ready doesn't fight it). */
export function getPersistedHostMode(gameCode: string): HostSeatMode {
  return readPersistedMode(gameCode)
}

function writePersistedMode(gameCode: string, mode: HostSeatMode) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(hostModeKey(gameCode), mode)
  } catch {
    // localStorage can throw in private mode / when full — persistence is best-effort.
  }
}

export interface UseHostSeatOptions {
  gameCode: string
  hostToken: string
  /** Current game status; seat changes are only allowed while 'waiting'. */
  gameStatus: string | undefined
  /** Live roster — used to reconcile the host's own row if it disappears elsewhere,
   *  and to read the host row's spectator flag (host-only = a seated spectator). */
  players: { id: string; spectator?: boolean }[]
  /** Reload the view's data after a seat change. */
  onReload: () => Promise<unknown> | unknown
  /** Toast helpers (usually from `useToast()`). */
  toast: { success: (msg: string) => void; error: (msg: string) => void }
  /** Extra fields to merge into the join POST body (e.g. Monopoly's token). */
  buildJoinBody?: (name: string) => Record<string, unknown>
  /** Called after the mode changes, for view-specific side effects (e.g. tab switch). */
  onModeChange?: (mode: HostSeatMode) => void
  /**
   * Whether a "Host & play" create intent may auto-seat the host without a click.
   * Defaults to true. Set false for games whose join needs a required extra choice
   * first (e.g. Monopoly's token) — auto-joining there POSTs an incomplete body and
   * fails validation, so the host must complete the join form manually instead.
   */
  autoJoinEnabled?: boolean
}

export interface UseHostSeatResult {
  hostMode: HostSeatMode
  hostPlayerId: string | null
  hostPlayerName: string
  hostResumeToken: string | null
  hostJoinName: string
  setHostJoinName: (name: string) => void
  hostJoining: boolean
  changeHostMode: (mode: HostSeatMode) => Promise<void>
  hostJoinGame: (nameOverride?: string) => Promise<void>
  leaveSeatKeepHosting: () => Promise<void>
  leaveGameRemovePlayer: () => Promise<void>
  renameHost: (name: string) => Promise<void>
  handlePlayerRemoved: (playerId: string) => void
}

export function useHostSeat(options: UseHostSeatOptions): UseHostSeatResult {
  const {
    gameCode,
    hostToken,
    gameStatus,
    players,
    onReload,
    toast,
    buildJoinBody,
    onModeChange,
    autoJoinEnabled = true,
  } = options

  const [hostMode, setHostMode] = useState<HostSeatMode>('player')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)

  // Refs so the mount effect and callbacks read fresh values without re-subscribing.
  const onReloadRef = useRef(onReload)
  onReloadRef.current = onReload
  const toastRef = useRef(toast)
  toastRef.current = toast
  const buildJoinBodyRef = useRef(buildJoinBody)
  buildJoinBodyRef.current = buildJoinBody
  const onModeChangeRef = useRef(onModeChange)
  onModeChangeRef.current = onModeChange
  const autoJoinEnabledRef = useRef(autoJoinEnabled)
  autoJoinEnabledRef.current = autoJoinEnabled

  const autoJoinArmedRef = useRef(false)
  const autoJoinNameRef = useRef('')
  const autoJoinFiredRef = useRef(false)

  // Mirror of hostPlayerId so handlePlayerRemoved can read the current seat without
  // a stale closure — and WITHOUT doing the read inside a setState updater (calling
  // clearPlayerSession there dispatches a session event mid-render → "update a
  // component while rendering" warnings in the host chrome).
  const hostPlayerIdRef = useRef(hostPlayerId)
  hostPlayerIdRef.current = hostPlayerId

  // "Host only" seats the host as a visible SPECTATOR row (spectator=true) — shown as
  // "Host · Watching" in the roster — so everyone sees the host with a HOST badge, in
  // the lobby and in-game. These arm a one-time spectator seat from the create intent,
  // and a one-time mode reconcile from the adopted row's spectator flag on refresh.
  const spectatorSeatArmRef = useRef<{ name: string } | null>(null)
  const spectatorSeatFiredRef = useRef(false)
  const modeReconciledRef = useRef(false)
  // Last mode the active-game reconcile synced from the row, so it only re-applies on an actual
  // change (avoids re-running onModeChange / persisting on every unrelated roster update).
  const lastSyncedModeRef = useRef<HostSeatMode | null>(null)

  const applyMode = useCallback(
    (mode: HostSeatMode) => {
      setHostMode(mode)
      writePersistedMode(gameCode, mode)
      onModeChangeRef.current?.(mode)
    },
    [gameCode]
  )

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (hostPlayerIdRef.current !== playerId) return
      setHostPlayerId(null)
      setHostResumeToken(null)
      setHostPlayerName('')
      clearPlayerSession(gameCode)
    },
    [gameCode]
  )

  const hostJoinGame = useCallback(
    async (nameOverride?: string) => {
      const name = (nameOverride ?? hostJoinName).trim()
      if (!name) return
      setHostJoining(true)
      try {
        const res = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameCode, playerName: name, ...(buildJoinBodyRef.current?.(name) ?? {}) }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to join')
        setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender ?? 'both', data.resumeToken)
        setHostPlayerId(data.playerId)
        setHostResumeToken(data.resumeToken ?? null)
        setHostPlayerName(data.playerName)
        setHostJoinName(data.playerName)
        applyMode('player')
        await onReloadRef.current()
        toastRef.current.success(`Joined as ${data.playerName}`)
      } catch (err) {
        toastRef.current.error(err instanceof Error ? err.message : 'Failed to join')
      } finally {
        setHostJoining(false)
      }
    },
    [gameCode, hostJoinName, applyMode]
  )

  // Seat the host as a SPECTATOR (a real player row with spectator=true) so they're
  // visible in the roster to everyone with a HOST badge, even in "Host only" mode.
  // Mirrors hostJoinGame but joins as a viewer; names default to "Host" when the host
  // never typed one (the row carries the HOST badge, so the label reads clearly).
  const seatHostAsSpectator = useCallback(
    async (nameOverride?: string) => {
      const name = (nameOverride ?? hostJoinName).trim() || 'Host'
      setHostJoining(true)
      try {
        const res = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameCode,
            playerName: name,
            joinAsViewer: true,
            ...(buildJoinBodyRef.current?.(name) ?? {}),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to seat')
        setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender ?? 'both', data.resumeToken)
        setHostPlayerId(data.playerId)
        setHostResumeToken(data.resumeToken ?? null)
        setHostPlayerName(data.playerName)
        applyMode('spectator')
        await onReloadRef.current()
      } catch (err) {
        toastRef.current.error(err instanceof Error ? err.message : 'Failed to seat')
      } finally {
        setHostJoining(false)
      }
    },
    [gameCode, hostJoinName, applyMode]
  )

  const changeHostMode = useCallback(
    async (mode: HostSeatMode) => {
      if (gameStatus !== 'waiting') return
      const prev = hostMode
      if (mode === prev) return
      applyMode(mode)
      try {
        // Flip the host's seat in place (keep the row): "Host only" sits out as a
        // spectator (ready:false → shown as "Host · Watching"), "Host + play" takes the
        // seat (ready:true). The host stays a visible roster row either way.
        if (hostPlayerId && hostResumeToken) {
          const res = await fetch('/api/players/ready', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, ready: mode === 'player' }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            // Taking a seat but the lobby is full: keep the host on "Host only" (they stay a
            // watcher) and tell them plainly rather than a generic failure.
            if (mode === 'player' && data.full) {
              applyMode(prev)
              toastRef.current.error(
                'Game is full — staying on Host only. Remove a player to free a seat, then Host + play.'
              )
              return
            }
            throw new Error(data.error ?? 'Failed to change seat')
          }
          await onReloadRef.current()
        } else if (mode === 'spectator') {
          // No seat yet (host-only from the start) → seat as a spectator so the host is
          // visible. Taking a player seat with no row is handled by the join form.
          await seatHostAsSpectator()
        }
      } catch (err) {
        applyMode(prev)
        toastRef.current.error(err instanceof Error ? err.message : 'Failed to change seat')
      }
    },
    [gameCode, gameStatus, hostMode, hostPlayerId, hostResumeToken, applyMode, seatHostAsSpectator]
  )

  // "Leave game (keep hosting)" — a seated host drops out of active play but keeps the
  // host token, so the game runs on and they watch. Unlike changeHostMode (lobby-only,
  // flips the ready flag in place) this is an ACTIVE-game action: it flips the host's own
  // row to spectator via /api/players/spectate — non-destructive, so the row/score survive
  // and the host can Join back in via the mid-game ViewerModeBanner ("Join as player").
  const leaveSeatKeepHosting = useCallback(async () => {
    if (!hostPlayerId || !hostResumeToken) return
    try {
      const res = await fetch('/api/players/spectate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, resumeToken: hostResumeToken }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to leave game')
      applyMode('spectator')
      await onReloadRef.current()
      toastRef.current.success("You've left the game — you're still hosting")
    } catch (err) {
      toastRef.current.error(err instanceof Error ? err.message : 'Failed to leave game')
    }
  }, [gameCode, hostPlayerId, hostResumeToken, applyMode])

  // "Leave game (keep hosting)" for turn-based / seat / role games, where a bare spectate
  // flag-flip would strand the host in turn_order (or leave a fixed seat short). Instead it
  // goes through the SAME destructive removal path a normal player leave uses (DELETE
  // /api/players → the game's removeXPlayer / reconcile helper splices turn_order, discards
  // the hand, reassigns the role, and — in a 2-player game — declares the other player the
  // winner). The host keeps their host token, so they stay in charge and watch on.
  //
  // Removal DELETES the row, which would drop the host out of the roster entirely — so if the
  // game is still going, we immediately re-seat them as a fresh SPECTATOR row (joinAsViewer)
  // so everyone still sees them in the drawer as the watching host (mirrors how the spectate
  // path keeps a visible "Host · Watching" row). Best-effort: if the game just ended (e.g. a
  // 2-player game the opponent won) or viewers aren't allowed, the viewer join no-ops and the
  // host simply stays removed.
  const leaveGameRemovePlayer = useCallback(async () => {
    if (!hostPlayerId || !hostResumeToken) return
    const watchName = hostPlayerName.trim() || 'Host'
    try {
      const res = await fetch('/api/players', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerId: hostPlayerId, resumeToken: hostResumeToken }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to leave game')
      // Drop the player seat + session, but KEEP the host token so the host stays in charge.
      clearPlayerSession(gameCode)
      setHostPlayerId(null)
      setHostResumeToken(null)
      setHostPlayerName('')
      applyMode('spectator')

      // Re-seat as a visible spectator so the host still shows in the roster as watching.
      try {
        const vres = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameCode,
            playerName: watchName,
            joinAsViewer: true,
            ...(buildJoinBodyRef.current?.(watchName) ?? {}),
          }),
        })
        const vdata = await vres.json().catch(() => ({}))
        if (vres.ok && vdata.playerId) {
          setPlayerSession(gameCode, vdata.playerId, vdata.playerName, vdata.playerGender ?? 'both', vdata.resumeToken)
          setHostPlayerId(vdata.playerId)
          setHostResumeToken(vdata.resumeToken ?? null)
          setHostPlayerName(vdata.playerName)
        }
      } catch {
        // Best-effort — the host stays removed (no roster row) if the re-seat can't happen.
      }

      await onReloadRef.current()
      toastRef.current.success("You've left the game — you're still hosting")
    } catch (err) {
      toastRef.current.error(err instanceof Error ? err.message : 'Failed to leave game')
    }
  }, [gameCode, hostPlayerId, hostResumeToken, hostPlayerName, applyMode])

  const renameHost = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed || !hostPlayerId) return
      try {
        const res = await fetch('/api/players', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameCode, playerId: hostPlayerId, playerName: trimmed, hostToken }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to update name')
        setHostPlayerName(data.playerName)
        setHostJoinName(data.playerName)
        setPlayerSession(gameCode, hostPlayerId, data.playerName, 'both', hostResumeToken)
        await onReloadRef.current()
        toastRef.current.success('Name updated!')
      } catch (err) {
        toastRef.current.error(err instanceof Error ? err.message : 'Failed to update name')
      }
    },
    [gameCode, hostToken, hostPlayerId, hostResumeToken]
  )

  // Seed once on mount: adopt an existing session, else honor the create-screen intent,
  // else fall back to the persisted mode.
  useEffect(() => {
    const session = getPlayerSession(gameCode)
    if (session) {
      setHostPlayerId(session.playerId)
      setHostResumeToken(session.resumeToken ?? null)
      setHostPlayerName(session.playerName)
      setHostJoinName(session.playerName)
      // A session no longer implies "player" — the host may hold a spectator seat
      // ("Host only"). Seed from the persisted mode; the one-shot reconcile below
      // corrects it from the row's spectator flag once players load.
      setHostMode(readPersistedMode(gameCode))
      return
    }

    const intent = consumeHostPlayIntent(gameCode)
    if (intent?.role === 'host') {
      setHostMode('spectator')
      writePersistedMode(gameCode, 'spectator')
      // Seat the host as a visible spectator ("Host · Watching") — no name needed.
      spectatorSeatArmRef.current = { name: intent.name }
      return
    }
    if (intent?.role === 'play' && intent.name.trim()) {
      const name = intent.name.trim()
      setHostJoinName(name)
      setHostMode('player')
      writePersistedMode(gameCode, 'player')
      // Games that need an extra required choice at join (e.g. Monopoly's token) opt out
      // of auto-seating: the name is prefilled, but the host completes the join form.
      if (autoJoinEnabledRef.current) {
        autoJoinArmedRef.current = true
        autoJoinNameRef.current = name
      }
      return
    }

    // No session and no create intent — a direct host link, a refresh before seating, or a
    // host who left the name blank on /create. The name is still known, so prefill it. This
    // is a PREFILL ONLY, never an auto-join: the create screen promises that leaving the name
    // blank means you add yourself from the lobby, and auto-seating here would break that.
    const remembered = getRememberedName()
    if (remembered) setHostJoinName((current) => (current.trim() ? current : remembered))
    setHostMode(readPersistedMode(gameCode))
  }, [gameCode])

  // Publish the host's own player id to the game so every client can badge the host
  // in the roster drawer (games.host_player_id). Fires whenever the host holds a seat
  // (host+play, or the host-only spectator seat) — idempotent server-side.
  useEffect(() => {
    if (!hostPlayerId || !hostToken) return
    void fetch(`/api/games/${gameCode}/host-player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostToken, playerId: hostPlayerId }),
    }).catch(() => {})
  }, [gameCode, hostToken, hostPlayerId])

  // One-time auto-join: only when armed by a real intent name and there's no seat yet.
  useEffect(() => {
    if (!autoJoinArmedRef.current || autoJoinFiredRef.current) return
    if (gameStatus !== 'waiting') return
    if (hostMode !== 'player') return
    if (hostPlayerId || hostJoining) return
    if (!autoJoinNameRef.current) return
    autoJoinFiredRef.current = true
    void hostJoinGame(autoJoinNameRef.current)
  }, [gameStatus, hostMode, hostPlayerId, hostJoining, hostJoinGame])

  // One-time: seat the host as a spectator when armed by a "Host only" create intent
  // and they don't already hold a seat, so the host shows as "Host · Watching".
  useEffect(() => {
    if (!spectatorSeatArmRef.current || spectatorSeatFiredRef.current) return
    if (gameStatus !== 'waiting' && gameStatus !== 'active') return
    if (hostPlayerId || hostJoining) return
    spectatorSeatFiredRef.current = true
    void seatHostAsSpectator(spectatorSeatArmRef.current.name)
  }, [gameStatus, hostPlayerId, hostJoining, seatHostAsSpectator])

  // Keep hostMode in sync with the host row's own spectator flag.
  //  - LOBBY: reconcile ONCE (a refresh adopts the session before players load, so the initial
  //    mode is a guess from the persisted value). Ref-gated so it never fights a deliberate
  //    changeHostMode toggle that optimistically sets the mode before the row round-trips.
  //  - ACTIVE: the row is the source of truth (changeHostMode is lobby-only), so sync
  //    continuously. This is what flips the host back to 'player' after they Join-as-player from
  //    the spectator banner — promote sets spectator=false on the row but never touches hostMode —
  //    and back to 'spectator' after they Leave. Guarded by lastSyncedModeRef so an unrelated
  //    roster update never reverts an in-flight leave (the row still reads its pre-change value
  //    until the action lands, so we simply hold the current mode until then).
  useEffect(() => {
    if (!hostPlayerId) return
    const row = players.find((p) => p.id === hostPlayerId)
    if (!row) return
    const rowMode: HostSeatMode = row.spectator ? 'spectator' : 'player'
    if (gameStatus !== 'active') {
      if (modeReconciledRef.current) return
      modeReconciledRef.current = true
      lastSyncedModeRef.current = rowMode
      setHostMode(rowMode)
      writePersistedMode(gameCode, rowMode)
      return
    }
    modeReconciledRef.current = true
    if (lastSyncedModeRef.current === rowMode) return
    lastSyncedModeRef.current = rowMode
    applyMode(rowMode)
  }, [players, hostPlayerId, gameCode, gameStatus, applyMode])

  // Clear stale host-as-player state if the host's own row is removed elsewhere.
  useHostPlayerReconciliation(players, hostPlayerId, () => handlePlayerRemoved(hostPlayerId!))

  return {
    hostMode,
    hostPlayerId,
    hostPlayerName,
    hostResumeToken,
    hostJoinName,
    setHostJoinName,
    hostJoining,
    changeHostMode,
    hostJoinGame,
    leaveSeatKeepHosting,
    leaveGameRemovePlayer,
    renameHost,
    handlePlayerRemoved,
  }
}
