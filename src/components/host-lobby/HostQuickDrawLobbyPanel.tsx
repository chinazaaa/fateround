'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lobbyMaxPlayersFromGame, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import {
  QUICK_DRAW_DEFAULT_DRAW_TIMER,
  QUICK_DRAW_DEFAULT_MAX_PLAYERS,
  QUICK_DRAW_DEFAULT_TITLE_TIMER,
  QUICK_DRAW_DEFAULT_VOTE_TIMER,
  QUICK_DRAW_DRAW_TIMER_OPTIONS,
  QUICK_DRAW_MAX_ROUNDS,
  QUICK_DRAW_MIN_ROUNDS,
  QUICK_DRAW_TITLE_TIMER_OPTIONS,
  QUICK_DRAW_VOTE_TIMER_OPTIONS,
  clampQuickDrawDrawTimer,
  clampQuickDrawRounds,
  clampQuickDrawTitleTimer,
  clampQuickDrawVariant,
  clampQuickDrawVoteTimer,
  formatQuickDrawTurnTimer,
  isQuickDrawGuessVariant,
  type QuickDrawVariant,
} from '@/lib/quick-draw'
import { QUICK_DRAW_GUESS_TEAM_OPTIONS, clampQuickDrawNumTeams, clampQuickDrawPlayMode } from '@/lib/quick-draw-guess'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostThemePicker } from '@/components/host-lobby/HostThemePicker'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { HostWordPoolSettings } from '@/components/host-lobby/HostWordPoolSettings'
import { gameSupportsViewerSetting } from '@/lib/viewers'
import { useToast } from '@/components/ui/Toast'
import type { Game, QuickDrawPlayMode } from '@/types'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  playerCount: number
  onGameUpdate: (game: Game) => void
}

type SaveState = 'idle' | 'saving' | 'saved'

const VARIANT_OPTIONS: { value: QuickDrawVariant; label: string }[] = [
  { value: 'lie', label: 'Lie' },
  { value: 'guess', label: 'Guess' },
]

const PLAY_MODE_OPTIONS: { value: QuickDrawPlayMode; label: string }[] = [
  { value: 'team', label: 'Teams' },
  { value: 'individual', label: 'Individual' },
]

export function HostQuickDrawLobbyPanel({ gameCode, hostToken, game, playerCount, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(QUICK_DRAW_DEFAULT_MAX_PLAYERS)
  const [roundsCount, setRoundsCount] = useState(3)
  const [variant, setVariant] = useState<QuickDrawVariant>('lie')
  const [playMode, setPlayMode] = useState<QuickDrawPlayMode>('team')
  const [numTeams, setNumTeams] = useState(2)
  const [drawTimer, setDrawTimer] = useState(QUICK_DRAW_DEFAULT_DRAW_TIMER)
  const [titleTimer, setTitleTimer] = useState(QUICK_DRAW_DEFAULT_TITLE_TIMER)
  const [voteTimer, setVoteTimer] = useState(QUICK_DRAW_DEFAULT_VOTE_TIMER)
  const [turnTimer, setTurnTimer] = useState(QUICK_DRAW_DEFAULT_DRAW_TIMER)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isGuess = isQuickDrawGuessVariant(variant)
  const isTeamGuess = isGuess && playMode !== 'individual'

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
    setMaxPlayers(lobbyMaxPlayersFromGame('quick_draw', game, limits))
    setRoundsCount(clampQuickDrawRounds(game.rounds_count))
    setVariant(clampQuickDrawVariant(game.quick_draw_variant))
    setPlayMode(clampQuickDrawPlayMode(game.quick_draw_play_mode))
    setNumTeams(clampQuickDrawNumTeams(game.quick_draw_num_teams))
    setDrawTimer(clampQuickDrawDrawTimer(game.timer_seconds))
    setTitleTimer(clampQuickDrawTitleTimer(game.operative_timer_seconds))
    setVoteTimer(clampQuickDrawVoteTimer(game.game_duration_seconds))
    setTurnTimer(clampQuickDrawDrawTimer(game.timer_seconds))
  }, [game, limits])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const limitCfg = limits?.quick_draw
  const minPlayers = limitCfg?.min ?? 3
  const maxCap = limitCfg?.max ?? 8

  const markSaved = useCallback(() => {
    setSaveState('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
  }, [])

  const patchSettings = useCallback(
    async (patch: Record<string, unknown>): Promise<boolean> => {
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
        return true
      } catch (err) {
        setSaveState('idle')
        toastError(err instanceof Error ? err.message : 'Failed to save settings')
        return false
      }
    },
    [gameCode, hostToken, markSaved, onGameUpdate, toastError]
  )

  const guardSaving = () => saveState === 'saving'

  const onMaxPlayersChange = (next: number) => {
    if (guardSaving()) return
    if (next < playerCount) {
      toastError(`Already have ${playerCount} players — remove someone first`)
      return
    }
    const previous = maxPlayers
    setMaxPlayers(next)
    void patchSettings({ max_players: next }).then((ok) => {
      if (!ok) setMaxPlayers(previous)
    })
  }

  const onRoundsCountChange = (next: number) => {
    if (guardSaving()) return
    const previous = roundsCount
    setRoundsCount(next)
    void patchSettings({ rounds_count: next }).then((ok) => {
      if (!ok) setRoundsCount(previous)
    })
  }

  const onVariantChange = (next: QuickDrawVariant) => {
    if (guardSaving() || next === variant) return
    const previous = variant
    setVariant(next)
    void patchSettings({ quick_draw_variant: next }).then((ok) => {
      if (!ok) setVariant(previous)
    })
  }

  const onPlayModeChange = (next: QuickDrawPlayMode) => {
    if (guardSaving() || next === playMode) return
    const previous = playMode
    setPlayMode(next)
    void patchSettings({ quick_draw_play_mode: next }).then((ok) => {
      if (!ok) setPlayMode(previous)
    })
  }

  const onNumTeamsChange = (next: number) => {
    if (guardSaving()) return
    const previous = numTeams
    setNumTeams(next)
    void patchSettings({ quick_draw_num_teams: next }).then((ok) => {
      if (!ok) setNumTeams(previous)
    })
  }

  const onDrawTimerChange = (next: number) => {
    if (guardSaving()) return
    const previous = drawTimer
    setDrawTimer(next)
    void patchSettings({ timer_seconds: next }).then((ok) => {
      if (!ok) setDrawTimer(previous)
    })
  }

  const onTitleTimerChange = (next: number) => {
    if (guardSaving()) return
    const previous = titleTimer
    setTitleTimer(next)
    void patchSettings({ operative_timer_seconds: next }).then((ok) => {
      if (!ok) setTitleTimer(previous)
    })
  }

  const onVoteTimerChange = (next: number) => {
    if (guardSaving()) return
    const previous = voteTimer
    setVoteTimer(next)
    void patchSettings({ game_duration_seconds: next }).then((ok) => {
      if (!ok) setVoteTimer(previous)
    })
  }

  const onTurnTimerChange = (next: number) => {
    if (guardSaving()) return
    const previous = turnTimer
    setTurnTimer(next)
    void patchSettings({ timer_seconds: next }).then((ok) => {
      if (!ok) setTurnTimer(previous)
    })
  }

  const maxPlayerOptions = useMemo(
    () => playerCountOptions(minPlayers, maxCap).map((n) => ({ value: n, label: String(n) })),
    [maxCap, minPlayers]
  )

  const roundOptions = useMemo(
    () =>
      Array.from(
        { length: QUICK_DRAW_MAX_ROUNDS - QUICK_DRAW_MIN_ROUNDS + 1 },
        (_, i) => i + QUICK_DRAW_MIN_ROUNDS
      ).map((n) => ({ value: n, label: String(n) })),
    []
  )

  const teamOptions = useMemo(() => QUICK_DRAW_GUESS_TEAM_OPTIONS.map((n) => ({ value: n, label: String(n) })), [])

  const drawTimerOptions = useMemo(() => QUICK_DRAW_DRAW_TIMER_OPTIONS.map((s) => ({ value: s, label: `${s}s` })), [])
  const titleTimerOptions = useMemo(() => QUICK_DRAW_TITLE_TIMER_OPTIONS.map((s) => ({ value: s, label: `${s}s` })), [])
  const voteTimerOptions = useMemo(() => QUICK_DRAW_VOTE_TIMER_OPTIONS.map((s) => ({ value: s, label: `${s}s` })), [])
  const turnTimerOptions = useMemo(
    () => QUICK_DRAW_DRAW_TIMER_OPTIONS.map((s) => ({ value: s, label: formatQuickDrawTurnTimer(s) })),
    []
  )

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  const summary = isGuess
    ? `Guess · ${playMode === 'individual' ? 'solo' : `${numTeams} teams`} · ${maxPlayers} max · ${roundsCount} rounds · ${formatQuickDrawTurnTimer(turnTimer)} per turn`
    : `${maxPlayers} max · ${roundsCount} rounds · ${drawTimer}s draw · ${titleTimer}s titles · ${voteTimer}s vote`

  return (
    <HostLobbySettingsSection status={statusLabel} summary={summary}>
      <HostLobbySettingBlock title="Game style">
        <HostLobbyOptionChips value={variant} options={VARIANT_OPTIONS} onChange={onVariantChange} />
        <p className="text-faint text-[11px] pt-1">
          {isGuess
            ? 'Draw a secret word — teammates or everyone races to guess.'
            : 'Drawful-style — draw weird prompts, write fake titles, vote for the funniest.'}
        </p>
      </HostLobbySettingBlock>

      {isGuess && (
        <>
          <HostLobbySettingBlock title="Mode">
            <HostLobbyOptionChips value={playMode} options={PLAY_MODE_OPTIONS} onChange={onPlayModeChange} />
          </HostLobbySettingBlock>

          {isTeamGuess && (
            <HostLobbySettingBlock title="Teams">
              <HostLobbyOptionChips value={numTeams} options={teamOptions} onChange={onNumTeamsChange} />
            </HostLobbySettingBlock>
          )}
        </>
      )}

      <HostLobbySettingBlock title={`Max players · ${playerCount} joined`}>
        <HostLobbyOptionChips value={maxPlayers} options={maxPlayerOptions} onChange={onMaxPlayersChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Rounds">
        <HostLobbyOptionChips value={roundsCount} options={roundOptions} onChange={onRoundsCountChange} />
      </HostLobbySettingBlock>

      {isGuess ? (
        <HostLobbySettingBlock title="Turn timer">
          <HostLobbyOptionChips value={turnTimer} options={turnTimerOptions} onChange={onTurnTimerChange} />
        </HostLobbySettingBlock>
      ) : (
        <>
          <HostLobbySettingBlock title="Draw timer">
            <HostLobbyOptionChips value={drawTimer} options={drawTimerOptions} onChange={onDrawTimerChange} />
          </HostLobbySettingBlock>

          <HostLobbySettingBlock title="Title timer">
            <HostLobbyOptionChips value={titleTimer} options={titleTimerOptions} onChange={onTitleTimerChange} />
          </HostLobbySettingBlock>

          <HostLobbySettingBlock title="Vote timer">
            <HostLobbyOptionChips value={voteTimer} options={voteTimerOptions} onChange={onVoteTimerChange} />
          </HostLobbySettingBlock>
        </>
      )}

      <HostLobbySettingBlock title={isGuess ? 'Words' : 'Prompts'}>
        <HostWordPoolSettings
          gameCode={gameCode}
          hostToken={hostToken}
          game={game}
          noun={isGuess ? 'words' : 'prompts'}
          disabled={saveState === 'saving'}
          onError={toastError}
          onSaved={(patch) => onGameUpdate({ ...game, ...patch })}
        />
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
