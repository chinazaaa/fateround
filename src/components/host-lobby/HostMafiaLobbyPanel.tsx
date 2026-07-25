'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lobbyMaxPlayersFromGame, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { gameSupportsViewerSetting } from '@/lib/viewers'
import { Toggle } from '@/components/ui/PageShell'
import { useToast } from '@/components/ui/Toast'
import type { Game } from '@/types'

const MAFIA_NIGHT_TIMER_OPTIONS = [30, 45, 60, 90, 120, 180] as const
const MAFIA_DAY_TIMER_OPTIONS = [45, 60, 90, 120, 180, 300] as const
const MAFIA_VOTING_TIMER_OPTIONS = [20, 30, 45, 60, 90] as const

// Mafia's 12 optional roles (on top of Villager/Mafia/Doctor/Detective). Classic uses the
// full 16-role roster (all of these default ON); Advanced reveals this checklist so a host
// can hand-pick a smaller/different mix instead of the full set.
const ADVANCED_ROLE_FIELDS = [
  'mafia_bodyguard_enabled',
  'mafia_mayor_enabled',
  'mafia_vigilante_enabled',
  'mafia_tracker_enabled',
  'mafia_alpha_wolf_enabled',
  'mafia_wolf_cub_enabled',
  'mafia_framer_enabled',
  'mafia_jester_enabled',
  'mafia_serial_killer_enabled',
  'mafia_arsonist_enabled',
  'mafia_cupid_enabled',
  'mafia_cursed_villager_enabled',
  'mafia_medium_enabled',
  'mafia_priest_enabled',
  'mafia_witch_enabled',
  'mafia_little_girl_enabled',
  'mafia_trapper_enabled',
] as const satisfies readonly (keyof Game)[]

const ADVANCED_ROLE_LABELS: Record<(typeof ADVANCED_ROLE_FIELDS)[number], { label: string; description: string }> = {
  mafia_bodyguard_enabled: { label: 'Bodyguard', description: 'Protects one player; dies in their place if attacked' },
  mafia_mayor_enabled: { label: 'Mayor', description: 'Day vote counts double' },
  mafia_vigilante_enabled: { label: 'Vigilante', description: 'Day shoot or reveal (each once)' },
  mafia_tracker_enabled: { label: 'Tracker', description: 'Learns who their target visited' },
  mafia_alpha_wolf_enabled: {
    label: 'Alpha Mafia',
    description: 'Kill vote counts double; can chat with the crew by day too',
  },
  mafia_wolf_cub_enabled: {
    label: 'Junior Mafia',
    description: 'Mafia gets a bonus kill next night if this role dies',
  },
  mafia_framer_enabled: { label: 'Framer', description: 'Frames a player so the Detective reads them as Mafia' },
  mafia_jester_enabled: { label: 'Jester', description: 'Wins alone if lynched' },
  mafia_serial_killer_enabled: { label: 'Serial Killer', description: 'Kills alone, wins as last one standing' },
  mafia_arsonist_enabled: {
    label: 'Arsonist',
    description: 'Douses 2 per night, ignites to kill all doused; immune to Mafia',
  },
  mafia_cupid_enabled: { label: 'Cupid', description: 'Links two players as Lovers on night one' },
  mafia_cursed_villager_enabled: {
    label: 'Cursed Villager',
    description: 'Converts to Mafia instead of dying if targeted',
  },
  mafia_medium_enabled: {
    label: 'Medium',
    description: 'Reads ghost chat at night, one-time revive',
  },
  mafia_priest_enabled: {
    label: 'Priest',
    description: 'Once per day, throw holy water — kills Mafia, or self-destructs',
  },
  mafia_witch_enabled: {
    label: 'Witch',
    description: 'One heal potion + one kill potion, each usable once per game',
  },
  mafia_little_girl_enabled: {
    label: 'Little Girl',
    description: "Secretly sees the Mafia's night target, risks being caught",
  },
  mafia_trapper_enabled: {
    label: 'Trapper',
    description: "Sets a nightly trap that blocks the Mafia's kill and reveals who set it off",
  },
}

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
  if (seconds === 300) return '5m'
  return `${seconds}s`
}

export function HostMafiaLobbyPanel({ gameCode, hostToken, game, playerCount, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(10)
  const [nightTimer, setNightTimer] = useState(60)
  const [dayTimer, setDayTimer] = useState(90)
  const [votingTimer, setVotingTimer] = useState(45)
  const [showCustomize, setShowCustomize] = useState(false)
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
    setNightTimer(game.timer_seconds ?? 60)
    setDayTimer(game.mafia_day_seconds ?? 90)
    setVotingTimer(game.mafia_voting_seconds ?? 45)
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

  // Customized iff the host has turned at least one of the 12 optional roles off from the
  // full Classic roster (the DB column default is true, so undefined/true = still on).
  const isCustomized = ADVANCED_ROLE_FIELDS.some((field) => game[field] === false)

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

  const onNightTimerChange = (next: number) => {
    setNightTimer(next)
    void patchSettings({ timer_seconds: next })
  }

  const onDayTimerChange = (next: number) => {
    setDayTimer(next)
    void patchSettings({ mafia_day_seconds: next })
  }

  const onVotingTimerChange = (next: number) => {
    setVotingTimer(next)
    void patchSettings({ mafia_voting_seconds: next })
  }

  const onResetToClassic = () => {
    setShowCustomize(false)
    const patch: Record<string, boolean> = {}
    for (const field of ADVANCED_ROLE_FIELDS) patch[field] = true
    void patchSettings(patch)
  }

  const onRoleFieldChange = (field: (typeof ADVANCED_ROLE_FIELDS)[number], next: boolean) => {
    void patchSettings({ [field]: next })
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

  const nightTimerOptions = useMemo(
    () => MAFIA_NIGHT_TIMER_OPTIONS.map((s) => ({ value: s, label: shortTimerLabel(s) })),
    []
  )
  const dayTimerOptions = useMemo(
    () => MAFIA_DAY_TIMER_OPTIONS.map((s) => ({ value: s, label: shortTimerLabel(s) })),
    []
  )
  const votingTimerOptions = useMemo(
    () => MAFIA_VOTING_TIMER_OPTIONS.map((s) => ({ value: s, label: shortTimerLabel(s) })),
    []
  )

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection status={statusLabel}>
      <HostLobbySettingBlock title={`Max players · ${playerCount} joined`}>
        <HostLobbyOptionChips value={maxPlayers} options={maxPlayerOptions} onChange={onMaxPlayersChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Night timer">
        <HostLobbyOptionChips value={nightTimer} options={nightTimerOptions} onChange={onNightTimerChange} />
        <p className="text-xs text-muted pt-1.5">How long night-action roles get to submit their move.</p>
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Day discussion timer">
        <HostLobbyOptionChips value={dayTimer} options={dayTimerOptions} onChange={onDayTimerChange} />
        <p className="text-xs text-muted pt-1.5">How long the town gets to talk before voting opens.</p>
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Voting timer">
        <HostLobbyOptionChips value={votingTimer} options={votingTimerOptions} onChange={onVotingTimerChange} />
        <p className="text-xs text-muted pt-1.5">How long players get to cast their lynch vote.</p>
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Role set">
        <div className="space-y-2 pt-1">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onResetToClassic}
              className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                !showCustomize && !isCustomized
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'border-[var(--border)] text-muted'
              }`}
            >
              Classic
            </button>
            <button
              type="button"
              onClick={() => setShowCustomize(true)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                showCustomize || isCustomized
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'border-[var(--border)] text-muted'
              }`}
            >
              Advanced
            </button>
          </div>
          <p className="text-xs text-muted">
            {showCustomize || isCustomized
              ? 'Pick exactly which of the 21 roles are in play.'
              : 'The full 17-role roster — Villager, Mafia, Doctor, Detective, plus 13 more mixed in when there are enough player slots.'}
          </p>
          {(showCustomize || isCustomized) && (
            <div className="space-y-2 pt-1">
              {ADVANCED_ROLE_FIELDS.map((field) => {
                const info = ADVANCED_ROLE_LABELS[field]
                return (
                  <Toggle
                    key={field}
                    label={info.label}
                    description={info.description}
                    value={game[field] !== false}
                    onChange={(v) => onRoleFieldChange(field, v)}
                  />
                )
              })}
            </div>
          )}
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
    </HostLobbySettingsSection>
  )
}
