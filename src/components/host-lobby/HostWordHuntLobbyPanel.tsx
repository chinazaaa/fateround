'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatWordHuntTimer, WORD_HUNT_TIMER_OPTIONS } from '@/lib/word-hunt'
import { lobbyMaxPlayersFromGame, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { gameSupportsViewerSetting } from '@/lib/viewers'
import { useToast } from '@/components/ui/Toast'
import type { Game } from '@/types'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  playerCount: number
  onGameUpdate: (game: Game) => void
}

type SaveState = 'idle' | 'saving' | 'saved'

function shortTimerLabel(seconds: number): string {
  if (seconds === 60) return '1m'
  if (seconds === 120) return '2m'
  if (seconds === 180) return '3m'
  if (seconds === 300) return '5m'
  return `${seconds}s`
}

export function HostWordHuntLobbyPanel({ gameCode, hostToken, game, playerCount, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [roundTimer, setRoundTimer] = useState(180)
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
    setMaxPlayers(lobbyMaxPlayersFromGame('word_hunt', game, limits))
    setRoundTimer(game.timer_seconds ?? 180)
  }, [game, limits])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const limitCfg = limits?.word_hunt
  const minPlayers = limitCfg?.min ?? 2
  const maxCap = limitCfg?.max ?? 20

  const markSaved = useCallback(() => {
    setSaveState('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
  }, [])

  const patchSettings = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaveState('saving')
      try {
        const res = await fetch(`/api/games/${gameCode}/lobby-settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, hostToken, ...patch }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to save settings')
        if (data.game) onGameUpdate(data.game)
        markSaved()
      } catch (err) {
        setSaveState('idle')
        toastError(err instanceof Error ? err.message : 'Failed to save settings')
      }
    },
    [gameCode, hostToken, markSaved, onGameUpdate, toastError]
  )

  const onMaxPlayersChange = (next: number) => {
    if (next < playerCount) {
      toastError(`Already have ${playerCount} players — remove someone first`)
      return
    }
    setMaxPlayers(next)
    void patchSettings({ max_players: next })
  }

  const onRoundTimerChange = (next: number) => {
    setRoundTimer(next)
    void patchSettings({ timer_seconds: next })
  }

  const maxPlayerOptions = useMemo(
    () =>
      playerCountOptions(minPlayers, maxCap).map((n) => ({
        value: n,
        label: String(n),
      })),
    [maxCap, minPlayers]
  )

  const timerOptions = useMemo(
    () =>
      WORD_HUNT_TIMER_OPTIONS.map((s) => ({
        value: s,
        label: shortTimerLabel(s),
      })),
    []
  )

  const summary = useMemo(
    () => [`${maxPlayers} max`, formatWordHuntTimer(roundTimer)].join(' · '),
    [maxPlayers, roundTimer]
  )

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection status={statusLabel} summary={summary}>
      <HostLobbySettingBlock title={`Max players · ${playerCount} joined`}>
        <HostLobbyOptionChips value={maxPlayers} options={maxPlayerOptions} onChange={onMaxPlayersChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Round time">
        <HostLobbyOptionChips value={roundTimer} options={timerOptions} onChange={onRoundTimerChange} />
      </HostLobbySettingBlock>

      {gameSupportsViewerSetting(game.game_type) && game.status === 'waiting' && (
        <HostLobbySettingBlock title="Late joiners">
          <HostAllowViewersField
            embedded
            hideHeader
            gameCode={gameCode}
            hostToken={hostToken}
            game={game}
            onGameUpdate={onGameUpdate}
          />
        </HostLobbySettingBlock>
      )}
    </HostLobbySettingsSection>
  )
}
