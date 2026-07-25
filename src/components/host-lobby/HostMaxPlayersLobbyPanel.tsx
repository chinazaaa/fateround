'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  lobbyMaxPlayersFromGame,
  playerCountOptions,
  type GamePlayerLimitsMap,
  type LobbyLimitGameType,
} from '@/lib/game-limits'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { useToast } from '@/components/ui/Toast'
import type { Game } from '@/types'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  /** Lobby-limit key for this game (e.g. 'trivia', 'i_call_on', 'two_truths'). */
  limitType: LobbyLimitGameType
  /** Current joined-player count — the floor the cap can't drop below. */
  playerCount: number
  onGameUpdate: (game: Game) => void
}

type SaveState = 'idle' | 'saving' | 'saved'

/**
 * Lobby Host-settings max-players control for games whose only missing create-time knob is
 * the player cap (Trivia, NPAT, Two Truths, Anonymous Messages). Saves via
 * POST /api/games/[code]/lobby-settings (which accepts max_players for any lobby-limit game).
 */
export function HostMaxPlayersLobbyPanel({ gameCode, hostToken, game, limitType, playerCount, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(game.max_players ?? 20)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void fetch('/api/game-limits')
      .then((res) => res.json())
      .then((data: { limits?: GamePlayerLimitsMap }) => {
        if (data.limits) setLimits(data.limits)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!limits) return
    setMaxPlayers(lobbyMaxPlayersFromGame(limitType, game, limits))
  }, [game, limitType, limits])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const limitCfg = limits?.[limitType]
  const minPlayers = limitCfg?.min ?? 1
  const maxCap = limitCfg?.max ?? 20

  const markSaved = useCallback(() => {
    setSaveState('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
  }, [])

  const onMaxPlayersChange = (next: number) => {
    if (saveState === 'saving' || next === maxPlayers) return
    if (next < playerCount) {
      toastError(`Already have ${playerCount} players — remove someone first`)
      return
    }
    const previous = maxPlayers
    setMaxPlayers(next)
    setSaveState('saving')
    void (async () => {
      try {
        const res = await fetch(`/api/games/${gameCode}/lobby-settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, hostToken, max_players: next }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to save settings')
        if (data.game) onGameUpdate(data.game)
        markSaved()
      } catch (err) {
        setMaxPlayers(previous)
        setSaveState('idle')
        toastError(err instanceof Error ? err.message : 'Failed to save settings')
      }
    })()
  }

  const maxPlayerOptions = useMemo(
    () => playerCountOptions(minPlayers, maxCap).map((n) => ({ value: n, label: String(n) })),
    [maxCap, minPlayers]
  )

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection
      status={statusLabel}
      alwaysVisible={
        <HostLobbySettingBlock title={`Max players · ${playerCount} joined`}>
          <HostLobbyOptionChips value={maxPlayers} options={maxPlayerOptions} onChange={onMaxPlayersChange} />
        </HostLobbySettingBlock>
      }
    />
  )
}
