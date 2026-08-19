'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { lobbyMaxPlayersFromGame, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import { TROLL_RUN_DEFAULT_MAX_PLAYERS, TROLL_RUN_MAX_PLAYERS, TROLL_RUN_MIN_PLAYERS } from '@/lib/troll-run-types'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { useToast } from '@/components/ui/Toast'
import { Glyph } from '@/components/icons/Glyph'
import {
  ArrowUpDownIcon,
  BlackHoleIcon,
  CrownIcon,
  DoorOpenIcon,
  FlashIcon,
  Moon02Icon,
  Tv01Icon,
} from '@hugeicons/core-free-icons'
import type { Game, ThemeId } from '@/types'

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

const WORLD_OPTIONS = [
  {
    value: 'pits',
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Glyph icon={BlackHoleIcon} size={14} />
        <span>W1: Pits</span>
      </span>
    ),
  },
  {
    value: 'doors',
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Glyph icon={DoorOpenIcon} size={14} />
        <span>W2: Doors</span>
      </span>
    ),
  },
  {
    value: 'gravity',
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Glyph icon={ArrowUpDownIcon} size={14} />
        <span>W3: Gravity</span>
      </span>
    ),
  },
  {
    value: 'gauntlet',
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Glyph icon={CrownIcon} size={14} />
        <span>W4: Gauntlet</span>
      </span>
    ),
  },
]

const THEME_OPTIONS: { value: ThemeId; label: React.ReactNode }[] = [
  {
    value: 'dark',
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Glyph icon={Moon02Icon} size={14} />
        <span>Dark Slate</span>
      </span>
    ),
  },
  {
    value: 'retro',
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Glyph icon={Tv01Icon} size={14} />
        <span>Retro 8-Bit</span>
      </span>
    ),
  },
  {
    value: 'neon',
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Glyph icon={FlashIcon} size={14} />
        <span>Cyber Neon</span>
      </span>
    ),
  },
]

export function HostTrollRunLobbyPanel({ gameCode, hostToken, game, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(TROLL_RUN_DEFAULT_MAX_PLAYERS)
  const [rounds, setRounds] = useState(game.troll_run_rounds ?? 5)
  const [timeLimit, setTimeLimit] = useState(game.troll_run_time_limit ?? 120)
  const [world, setWorld] = useState(game.troll_run_world ?? 'pits')
  const [theme, setTheme] = useState<ThemeId>((game.theme as ThemeId) ?? 'dark')
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
    setWorld(game.troll_run_world ?? 'pits')
    setTheme((game.theme as ThemeId) ?? 'dark')
  }, [game, limits])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const limitCfg = limits?.troll_run
  const minPlayers = limitCfg?.min ?? TROLL_RUN_MIN_PLAYERS
  const maxCap = limitCfg?.max ?? TROLL_RUN_MAX_PLAYERS

  const markSaved = () => {
    setSaveState('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
  }

  const saveSettings = useCallback(
    async (patch: {
      max_players?: number
      troll_run_rounds?: number
      troll_run_time_limit?: number
      troll_run_world?: string
      theme?: ThemeId
    }): Promise<boolean> => {
      setSaveState('saving')
      try {
        const res = await fetch(`/api/games/${gameCode}/lobby-settings`, {
          method: 'POST',
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
          return false
        }
        onGameUpdate({
          ...game,
          ...patch,
        })
        markSaved()
        return true
      } catch {
        toastError('Network error saving settings')
        setSaveState('idle')
        return false
      }
    },
    [gameCode, hostToken, game, onGameUpdate, toastError]
  )

  const playerOpts = playerCountOptions(minPlayers, maxCap)
  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection title="Troll Run Settings" status={statusLabel} defaultOpen={true}>
      {/* Visual Palette */}
      <HostLobbySettingBlock title="Visual Palette">
        <HostLobbyOptionChips<ThemeId>
          options={THEME_OPTIONS}
          value={theme}
          onChange={(value) => {
            if (saveState === 'saving' || value === theme) return
            const previous = theme
            setTheme(value)
            void saveSettings({ theme: value }).then((ok) => {
              if (!ok) setTheme(previous)
            })
          }}
        />
      </HostLobbySettingBlock>

      {/* World Selector */}
      <HostLobbySettingBlock title="World Theme">
        <HostLobbyOptionChips<string>
          options={WORLD_OPTIONS}
          value={world}
          onChange={(value) => {
            if (saveState === 'saving' || value === world) return
            const previous = world
            setWorld(value)
            void saveSettings({ troll_run_world: value }).then((ok) => {
              if (!ok) setWorld(previous)
            })
          }}
        />
      </HostLobbySettingBlock>

      {/* Max Players */}
      <HostLobbySettingBlock title="Player Limit">
        <HostLobbyOptionChips
          options={playerOpts.map((count) => ({ value: count, label: `${count} players` }))}
          value={maxPlayers}
          onChange={(value) => {
            if (saveState === 'saving' || value === maxPlayers) return
            const previous = maxPlayers
            setMaxPlayers(value)
            void saveSettings({ max_players: value }).then((ok) => {
              if (!ok) setMaxPlayers(previous)
            })
          }}
        />
      </HostLobbySettingBlock>

      {/* Rounds Count */}
      <HostLobbySettingBlock title="Number of Rounds">
        <HostLobbyOptionChips
          options={ROUNDS_OPTIONS}
          value={rounds}
          onChange={(value) => {
            if (saveState === 'saving' || value === rounds) return
            const previous = rounds
            setRounds(value)
            void saveSettings({ troll_run_rounds: value }).then((ok) => {
              if (!ok) setRounds(previous)
            })
          }}
        />
      </HostLobbySettingBlock>

      {/* Time Limit per round */}
      <HostLobbySettingBlock title="Time Limit per Round">
        <HostLobbyOptionChips
          options={TIME_LIMIT_OPTIONS}
          value={timeLimit}
          onChange={(value) => {
            if (saveState === 'saving' || value === timeLimit) return
            const previous = timeLimit
            setTimeLimit(value)
            void saveSettings({ troll_run_time_limit: value }).then((ok) => {
              if (!ok) setTimeLimit(previous)
            })
          }}
        />
      </HostLobbySettingBlock>

      {/* Viewers & Spectators */}
      <HostAllowViewersField gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={onGameUpdate} />
    </HostLobbySettingsSection>
  )
}
