'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lobbyMaxPlayersFromGame, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostThemePicker } from '@/components/host-lobby/HostThemePicker'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { gameSupportsViewerSetting } from '@/lib/viewers'
import { Toggle } from '@/components/ui/PageShell'
import { useToast } from '@/components/ui/Toast'
import type { Game } from '@/types'

const MAFIA_TIMER_OPTIONS = [30, 45, 60, 90, 120, 180] as const

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
  if (seconds === 90) return '1.5m'
  if (seconds === 120) return '2m'
  if (seconds === 180) return '3m'
  return `${seconds}s`
}

export function HostMafiaLobbyPanel({ gameCode, hostToken, game, playerCount, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(10)
  const [turnTimer, setTurnTimer] = useState(60)
  const [doctorEnabled, setDoctorEnabled] = useState(true)
  const [detectiveEnabled, setDetectiveEnabled] = useState(true)
  const [anonymousVotes, setAnonymousVotes] = useState(false)
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
    setMaxPlayers(lobbyMaxPlayersFromGame('mafia', game, limits))
    setTurnTimer(game.timer_seconds ?? 60)
    setDoctorEnabled(game.mafia_doctor_enabled !== false)
    setDetectiveEnabled(game.mafia_detective_enabled !== false)
    setAnonymousVotes(game.mafia_anonymous_votes === true)
  }, [game, limits])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const limitCfg = limits?.mafia
  const minPlayers = limitCfg?.min ?? 5
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

  const onTimerChange = (next: number) => {
    setTurnTimer(next)
    void patchSettings({ timer_seconds: next })
  }

  const onDoctorChange = (next: boolean) => {
    setDoctorEnabled(next)
    void patchSettings({ mafia_doctor_enabled: next })
  }

  const onDetectiveChange = (next: boolean) => {
    setDetectiveEnabled(next)
    void patchSettings({ mafia_detective_enabled: next })
  }

  const onAnonymousVotesChange = (next: boolean) => {
    setAnonymousVotes(next)
    void patchSettings({ mafia_anonymous_votes: next })
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
      MAFIA_TIMER_OPTIONS.map((s) => ({
        value: s,
        label: shortTimerLabel(s),
      })),
    []
  )

  const summary = useMemo(
    () => [`${maxPlayers} max`, `${shortTimerLabel(turnTimer)} phase`].join(' · '),
    [maxPlayers, turnTimer]
  )

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection status={statusLabel} summary={summary}>
      <HostLobbySettingBlock title={`Max players · ${playerCount} joined`}>
        <HostLobbyOptionChips value={maxPlayers} options={maxPlayerOptions} onChange={onMaxPlayersChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Phase time limit">
        <HostLobbyOptionChips value={turnTimer} options={timerOptions} onChange={onTimerChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Special roles">
        <div className="space-y-3 pt-1">
          <Toggle
            label="Doctor"
            description="Can heal 1 player each night"
            value={doctorEnabled}
            onChange={onDoctorChange}
          />
          <Toggle
            label="Detective"
            description="Can inspect 1 player each night"
            value={detectiveEnabled}
            onChange={onDetectiveChange}
          />
        </div>
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Voting rules">
        <div className="pt-1">
          <Toggle
            label="Anonymous votes"
            description="Hide who voted for whom during the day phase"
            value={anonymousVotes}
            onChange={onAnonymousVotesChange}
          />
        </div>
      </HostLobbySettingBlock>

      <HostThemePicker gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={onGameUpdate} />
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
