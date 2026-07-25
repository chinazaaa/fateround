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

// Role selection is fully automatic (see resolveMafiaRoundToggles in @/lib/mafia): a fixed
// core is always in, the investigator trio (Aura Seer/Seer/Detective) and Mafia specialist
// pool rotate every game, and this single switch swaps three Classic roles for their Advanced
// counterpart — no more picking each role on/off individually.

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
  const [advancedMode, setAdvancedMode] = useState(false)
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
    setAdvancedMode(game.mafia_advanced_mode === true)
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

  const onAdvancedModeChange = (next: boolean) => {
    setAdvancedMode(next)
    void patchSettings({ mafia_advanced_mode: next })
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
              onClick={() => onAdvancedModeChange(false)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                !advancedMode
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'border-[var(--border)] text-muted'
              }`}
            >
              Classic
            </button>
            <button
              type="button"
              onClick={() => onAdvancedModeChange(true)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                advancedMode
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'border-[var(--border)] text-muted'
              }`}
            >
              Advanced
            </button>
          </div>
          <p className="text-xs text-muted">
            {advancedMode
              ? 'Trapper, Arsonist, and Vigilante replace Bodyguard, Serial Killer, and Priest — Witch and Little Girl join the mix too.'
              : 'The classic power roles: Bodyguard, Serial Killer, and Priest.'}
          </p>
          <p className="text-xs text-muted">
            Everything else is automatic — Aura Seer/Seer/Detective rotate (only 2 of the 3 each game), and the Mafia's
            specialist lineup varies too.
          </p>
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
