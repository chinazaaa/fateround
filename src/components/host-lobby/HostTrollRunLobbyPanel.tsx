'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { lobbyMaxPlayersFromGame, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import { TROLL_RUN_DEFAULT_MAX_PLAYERS, TROLL_RUN_MAX_PLAYERS, TROLL_RUN_MIN_PLAYERS } from '@/lib/troll-run'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { useToast } from '@/components/ui/Toast'
import type { Game } from '@/types'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  onGameUpdate: (game: Game) => void
}

type SaveState = 'idle' | 'saving' | 'saved'

const ROUNDS_OPTIONS = [
  { value: 3, label: '3 Rounds' },
  { value: 5, label: '5 Rounds' },
  { value: 7, label: '7 Rounds' },
]

const TIME_LIMIT_OPTIONS = [
  { value: 60, label: '1 min' },
  { value: 90, label: '1.5 min' },
  { value: 120, label: '2 mins' },
  { value: 180, label: '3 mins' },
]

export function HostTrollRunLobbyPanel({ gameCode, hostToken, game, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(TROLL_RUN_DEFAULT_MAX_PLAYERS)
  const [rounds, setRounds] = useState(game.troll_run_rounds ?? 5)
  const [timeLimit, setTimeLimit] = useState(game.troll_run_time_limit ?? 120)
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
    setMaxPlayers(lobbyMaxPlayersFromGame('troll_run', game, limits))
    setRounds(game.troll_run_rounds ?? 5)
    setTimeLimit(game.troll_run_time_limit ?? 120)
  }, [game, limits])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const limitCfg = limits?.troll_run
  const minPlayers = limitCfg?.min ?? TROLL_RUN_MIN_PLAYERS
  const maxCap = limitCfg?.max ?? TROLL_RUN_MAX_PLAYERS

  const markSaved = useCallback(() => {
    setSaveState('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
  }, [])

  const saveSettings = useCallback(
    async (patch: { max_players?: number; troll_run_rounds?: number; troll_run_time_limit?: number }) => {
      setSaveState('saving')
      try {
        const res = await fetch(`/api/games/${gameCode}/lobby-settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hostToken,
            ...patch,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          toastError(data.error || 'Failed to save settings')
          setSaveState('idle')
          return
        }
        onGameUpdate({
          ...game,
          ...patch,
        })
        markSaved()
      } catch {
        toastError('Network error saving settings')
        setSaveState('idle')
      }
    },
    [gameCode, hostToken, game, onGameUpdate, markSaved, toastError]
  )

  const playerOpts = playerCountOptions(minPlayers, maxCap)

  return (
    <HostLobbySettingsSection title="Troll Run Settings" defaultOpen={true}>
      {/* Max Players */}
      <HostLobbySettingBlock title="Player Limit">
        <HostLobbyOptionChips
          options={playerOpts.map((n) => ({ value: n, label: `${n} players` }))}
          value={maxPlayers}
          onChange={(val) => {
            setMaxPlayers(val)
            void saveSettings({ max_players: val })
          }}
        />
      </HostLobbySettingBlock>

      {/* Rounds Count */}
      <HostLobbySettingBlock title="Number of Rounds">
        <HostLobbyOptionChips
          options={ROUNDS_OPTIONS}
          value={rounds}
          onChange={(val) => {
            setRounds(val)
            void saveSettings({ troll_run_rounds: val })
          }}
        />
      </HostLobbySettingBlock>

      {/* Time Limit per round */}
      <HostLobbySettingBlock title="Time Limit per Round">
        <HostLobbyOptionChips
          options={TIME_LIMIT_OPTIONS}
          value={timeLimit}
          onChange={(val) => {
            setTimeLimit(val)
            void saveSettings({ troll_run_time_limit: val })
          }}
        />
      </HostLobbySettingBlock>

      {/* Viewers & Spectators */}
      <HostAllowViewersField gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={onGameUpdate} />
    </HostLobbySettingsSection>
  )
}
