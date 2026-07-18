// src/hooks/useHostSeat.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { consumeHostPlayIntent } from '@/lib/host-play-intent'
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
 * Seeding on mount (in priority order):
 *  1. An existing player session (`getPlayerSession`) → adopt it, mode 'player'.
 *  2. The create-screen intent (`consumeHostPlayIntent`, one-shot):
 *       - role 'host' → mode 'spectator'.
 *       - role 'play' WITH a name → mode 'player', prefill the name, and arm a
 *         one-time auto-join so the host is seated without a manual click.
 *  3. Otherwise → the per-game persisted mode (default 'player'), no auto-join.
 *
 * A name is NEVER invented: if no real name was supplied, the host stays unseated
 * with the join form showing (the old Whot bug seated a literal "Host").
 */

const hostModeKey = (gameCode: string) => `host_mode_${gameCode.toUpperCase()}`

function readPersistedMode(gameCode: string): HostSeatMode {
  if (typeof window === 'undefined') return 'player'
  return localStorage.getItem(hostModeKey(gameCode)) === 'spectator' ? 'spectator' : 'player'
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
  /** Live roster — used to reconcile the host's own row if it disappears elsewhere. */
  players: { id: string }[]
  /** Reload the view's data after a seat change. */
  onReload: () => Promise<unknown> | unknown
  /** Toast helpers (usually from `useToast()`). */
  toast: { success: (msg: string) => void; error: (msg: string) => void }
  /** Extra fields to merge into the join POST body (e.g. Monopoly's token). */
  buildJoinBody?: (name: string) => Record<string, unknown>
  /** Called after the mode changes, for view-specific side effects (e.g. tab switch). */
  onModeChange?: (mode: HostSeatMode) => void
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
  renameHost: (name: string) => Promise<void>
  handlePlayerRemoved: (playerId: string) => void
}

export function useHostSeat(options: UseHostSeatOptions): UseHostSeatResult {
  const { gameCode, hostToken, gameStatus, players, onReload, toast, buildJoinBody, onModeChange } = options

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

  const autoJoinArmedRef = useRef(false)
  const autoJoinNameRef = useRef('')
  const autoJoinFiredRef = useRef(false)

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
      setHostPlayerId((current) => {
        if (current === playerId) {
          setHostResumeToken(null)
          setHostPlayerName('')
          clearPlayerSession(gameCode)
          return null
        }
        return current
      })
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

  const changeHostMode = useCallback(
    async (mode: HostSeatMode) => {
      if (gameStatus !== 'waiting') return
      const prev = hostMode
      applyMode(mode)
      // Switching to "Host only" while holding a seat → give up the seat so the
      // host drops out of the players list.
      if (mode === 'spectator' && prev === 'player' && hostPlayerId) {
        try {
          const res = await fetch('/api/players', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameCode, playerId: hostPlayerId, hostToken }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error ?? 'Failed to leave seat')
          }
          handlePlayerRemoved(hostPlayerId)
          await onReloadRef.current()
        } catch (err) {
          toastRef.current.error(err instanceof Error ? err.message : 'Failed to leave seat')
        }
      }
    },
    [gameCode, hostToken, gameStatus, hostMode, hostPlayerId, applyMode, handlePlayerRemoved]
  )

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
      setHostMode('player')
      return
    }

    const intent = consumeHostPlayIntent(gameCode)
    if (intent?.role === 'host') {
      setHostMode('spectator')
      writePersistedMode(gameCode, 'spectator')
      return
    }
    if (intent?.role === 'play' && intent.name.trim()) {
      const name = intent.name.trim()
      setHostJoinName(name)
      setHostMode('player')
      writePersistedMode(gameCode, 'player')
      autoJoinArmedRef.current = true
      autoJoinNameRef.current = name
      return
    }

    setHostMode(readPersistedMode(gameCode))
  }, [gameCode])

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
    renameHost,
    handlePlayerRemoved,
  }
}
