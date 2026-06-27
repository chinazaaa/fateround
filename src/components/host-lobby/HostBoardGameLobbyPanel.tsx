'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  boardGameToLobbyLimitType,
  formatBoardGameTurnTimer,
  turnTimerOptionsFor,
  type BoardGameLobbyType,
} from '@/lib/board-game-lobby-settings'
import { formatMonopolyGameDuration, MONOPOLY_GAME_DURATION_OPTIONS } from '@/lib/monopoly'
import { formatWhotGameDuration, WHOT_GAME_DURATION_OPTIONS } from '@/lib/whot'
import { lobbyMaxPlayersFromGame, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import { gameSupportsViewerSetting, lateJoinPolicyFromGame } from '@/lib/viewers'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { Toggle } from '@/components/ui/PageShell'
import { useToast } from '@/components/ui/Toast'
import type { Game } from '@/types'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  boardGameType: BoardGameLobbyType
  playerCount: number
  onGameUpdate: (game: Game) => void
}

type SaveState = 'idle' | 'saving' | 'saved'

function shortDurationLabel(seconds: number, formatter: (s: number) => string): string {
  if (!seconds) return 'Off'
  const full = formatter(seconds)
  if (full === 'No limit') return 'Off'
  return full.replace(' minutes', 'm').replace(' minute', 'm').replace(' hours', 'h').replace(' hour', 'h')
}

function shortTurnLabel(seconds: number): string {
  if (!seconds) return 'Off'
  if (seconds === 120) return '2m'
  return `${seconds}s`
}

export function HostBoardGameLobbyPanel({
  gameCode,
  hostToken,
  game,
  boardGameType,
  playerCount,
  onGameUpdate,
}: Props) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [turnTimer, setTurnTimer] = useState(0)
  const [gameDuration, setGameDuration] = useState(0)
  const [whotPick3Enabled, setWhotPick3Enabled] = useState(true)
  const [whotPick2Stacking, setWhotPick2Stacking] = useState(true)
  const [whotCardsEnabled, setWhotCardsEnabled] = useState(true)
  const [whotNumberCallsEnabled, setWhotNumberCallsEnabled] = useState(true)
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
    setMaxPlayers(lobbyMaxPlayersFromGame(boardGameToLobbyLimitType(boardGameType), game, limits))
    setTurnTimer(game.timer_seconds ?? 0)
    setGameDuration(game.game_duration_seconds ?? 0)
    if (boardGameType === 'whot') {
      setWhotPick3Enabled(game.whot_pick3_enabled !== false)
      setWhotPick2Stacking(game.whot_pick2_stacking !== false)
      setWhotCardsEnabled(game.whot_cards_enabled !== false)
      setWhotNumberCallsEnabled(game.whot_number_calls_enabled !== false)
    }
  }, [boardGameType, game, limits])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const limitCfg = limits?.[boardGameToLobbyLimitType(boardGameType)]
  const minPlayers = limitCfg?.min ?? 2
  const maxCap = limitCfg?.max ?? 6

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

  const onTurnTimerChange = (next: number) => {
    setTurnTimer(next)
    void patchSettings({ timer_seconds: next })
  }

  const onGameDurationChange = (next: number) => {
    setGameDuration(next)
    void patchSettings({ game_duration_seconds: next })
  }

  const onWhotRuleChange = (patch: Record<string, boolean>) => {
    if (patch.whot_pick3_enabled !== undefined) setWhotPick3Enabled(patch.whot_pick3_enabled)
    if (patch.whot_pick2_stacking !== undefined) setWhotPick2Stacking(patch.whot_pick2_stacking)
    if (patch.whot_cards_enabled !== undefined) setWhotCardsEnabled(patch.whot_cards_enabled)
    if (patch.whot_number_calls_enabled !== undefined) setWhotNumberCallsEnabled(patch.whot_number_calls_enabled)
    void patchSettings(patch)
  }

  const maxPlayerOptions = useMemo(
    () =>
      playerCountOptions(minPlayers, maxCap).map((n) => ({
        value: n,
        label: String(n),
      })),
    [maxCap, minPlayers]
  )

  const turnTimerOptions = useMemo(
    () =>
      turnTimerOptionsFor(boardGameType).map((s) => ({
        value: s,
        label: shortTurnLabel(s),
      })),
    [boardGameType]
  )

  const durationFormatter = boardGameType === 'whot' ? formatWhotGameDuration : formatMonopolyGameDuration
  const durationOptionsSource = boardGameType === 'whot' ? WHOT_GAME_DURATION_OPTIONS : MONOPOLY_GAME_DURATION_OPTIONS

  const durationOptions = useMemo(
    () =>
      durationOptionsSource.map((s) => ({
        value: s,
        label: shortDurationLabel(s, durationFormatter),
      })),
    [durationFormatter, durationOptionsSource]
  )

  const summary = useMemo(() => {
    const parts = [`${maxPlayers} max`, formatBoardGameTurnTimer(turnTimer)]
    if (boardGameType === 'monopoly' || boardGameType === 'whot') {
      parts.push(durationFormatter(gameDuration))
    }
    if (gameSupportsViewerSetting(game.game_type)) {
      const policy = lateJoinPolicyFromGame(game)
      parts.push(policy === 'lobby_only' ? 'Lobby only' : policy === 'viewers_only' ? 'Viewers OK' : 'Late play OK')
    }
    return parts.join(' · ')
  }, [boardGameType, durationFormatter, game, gameDuration, maxPlayers, turnTimer])

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection status={statusLabel} summary={summary}>
      <HostLobbySettingBlock title={`Max players · ${playerCount} joined`}>
        <HostLobbyOptionChips value={maxPlayers} options={maxPlayerOptions} onChange={onMaxPlayersChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Turn timer">
        <HostLobbyOptionChips value={turnTimer} options={turnTimerOptions} onChange={onTurnTimerChange} />
      </HostLobbySettingBlock>

      {(boardGameType === 'monopoly' || boardGameType === 'whot') && (
        <HostLobbySettingBlock title="Game length">
          <HostLobbyOptionChips value={gameDuration} options={durationOptions} onChange={onGameDurationChange} />
        </HostLobbySettingBlock>
      )}

      {boardGameType === 'whot' && (
        <HostLobbySettingBlock title="House rules">
          <div className="space-y-1.5">
            <Toggle
              label="Pick 3"
              description="Include 5 cards and the Pick 3 draw penalty"
              value={whotPick3Enabled}
              onChange={(v) => onWhotRuleChange({ whot_pick3_enabled: v })}
            />
            <Toggle
              label="Stack Pick 2"
              description="On: defend a Pick 2 with your own 2. Off: you must draw it."
              value={whotPick2Stacking}
              onChange={(v) => onWhotRuleChange({ whot_pick2_stacking: v })}
            />
            <Toggle
              label="WHOT cards"
              description="Include WHOT wild cards in the deck"
              value={whotCardsEnabled}
              onChange={(v) => onWhotRuleChange({ whot_cards_enabled: v })}
            />
            <div className={whotCardsEnabled ? undefined : 'opacity-50 pointer-events-none'}>
              <Toggle
                label="Numbers on WHOT"
                description="Call a number when playing WHOT"
                value={whotNumberCallsEnabled}
                onChange={(v) => onWhotRuleChange({ whot_number_calls_enabled: v })}
              />
            </div>
          </div>
        </HostLobbySettingBlock>
      )}

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
