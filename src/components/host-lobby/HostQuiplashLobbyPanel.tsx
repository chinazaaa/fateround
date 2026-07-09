'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lobbyMaxPlayersFromGame, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import {
  QUIPLASH_MAX_ROUNDS,
  QUIPLASH_MIN_ROUNDS,
  QUIPLASH_SUBMIT_TIMER_OPTIONS,
  QUIPLASH_VOTE_TIMER_OPTIONS,
  clampQuiplashRounds,
} from '@/lib/quiplash'
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

export function HostQuiplashLobbyPanel({ gameCode, hostToken, game, playerCount, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [roundsCount, setRoundsCount] = useState(3)
  const [submitTimer, setSubmitTimer] = useState(60)
  const [voteTimer, setVoteTimer] = useState(15)
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
    setMaxPlayers(lobbyMaxPlayersFromGame('quiplash', game, limits))
    setRoundsCount(clampQuiplashRounds(game.rounds_count))
    setSubmitTimer(game.timer_seconds ?? 60)
    setVoteTimer(game.operative_timer_seconds ?? 15)
  }, [game, limits])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const limitCfg = limits?.quiplash
  const minPlayers = limitCfg?.min ?? 3
  const maxCap = limitCfg?.max ?? 6

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

  const onMaxPlayersChange = (next: number) => {
    if (saveState === 'saving') return
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
    if (saveState === 'saving') return
    const previous = roundsCount
    setRoundsCount(next)
    void patchSettings({ rounds_count: next }).then((ok) => {
      if (!ok) setRoundsCount(previous)
    })
  }

  const onSubmitTimerChange = (next: number) => {
    if (saveState === 'saving') return
    const previous = submitTimer
    setSubmitTimer(next)
    void patchSettings({ timer_seconds: next }).then((ok) => {
      if (!ok) setSubmitTimer(previous)
    })
  }

  const onVoteTimerChange = (next: number) => {
    if (saveState === 'saving') return
    const previous = voteTimer
    setVoteTimer(next)
    void patchSettings({ operative_timer_seconds: next }).then((ok) => {
      if (!ok) setVoteTimer(previous)
    })
  }

  const maxPlayerOptions = useMemo(
    () =>
      playerCountOptions(minPlayers, maxCap).map((n) => ({
        value: n,
        label: String(n),
      })),
    [maxCap, minPlayers]
  )

  const roundOptions = useMemo(
    () =>
      Array.from({ length: QUIPLASH_MAX_ROUNDS - QUIPLASH_MIN_ROUNDS + 1 }, (_, i) => i + QUIPLASH_MIN_ROUNDS).map(
        (n) => ({ value: n, label: String(n) })
      ),
    []
  )

  const submitTimerOptions = useMemo(
    () => QUIPLASH_SUBMIT_TIMER_OPTIONS.map((s) => ({ value: s, label: `${s}s` })),
    []
  )

  const voteTimerOptions = useMemo(
    () => QUIPLASH_VOTE_TIMER_OPTIONS.map((s) => ({ value: s, label: `${s}s` })),
    []
  )

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection
      status={statusLabel}
      summary={`${maxPlayers} max · ${roundsCount} rounds · ${submitTimer}s answer · ${voteTimer}s vote`}
    >
      <HostLobbySettingBlock title={`Max players · ${playerCount} joined`}>
        <HostLobbyOptionChips value={maxPlayers} options={maxPlayerOptions} onChange={onMaxPlayersChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Rounds">
        <HostLobbyOptionChips value={roundsCount} options={roundOptions} onChange={onRoundsCountChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Answer timer">
        <HostLobbyOptionChips value={submitTimer} options={submitTimerOptions} onChange={onSubmitTimerChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Vote timer (per battle)">
        <HostLobbyOptionChips value={voteTimer} options={voteTimerOptions} onChange={onVoteTimerChange} />
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
