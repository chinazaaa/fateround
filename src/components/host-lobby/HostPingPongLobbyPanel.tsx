'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { useToast } from '@/components/ui/Toast'
import { PING_PONG_POINTS_OPTIONS, PING_PONG_GAME_DURATION_OPTIONS, formatPingPongDuration } from '@/lib/ping-pong'
import type { Game } from '@/types'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  onGameUpdate: (game: Game) => void
}

type SaveState = 'idle' | 'saving' | 'saved'

export function HostPingPongLobbyPanel({ gameCode, hostToken, game, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const [pointsToWin, setPointsToWin] = useState(game.ping_pong_points_to_win ?? 7)
  const [gameDuration, setGameDuration] = useState(game.game_duration_seconds ?? 0)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setPointsToWin(game.ping_pong_points_to_win ?? 7)
    setGameDuration(game.game_duration_seconds ?? 0)
  }, [game.ping_pong_points_to_win, game.game_duration_seconds])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const markSaved = useCallback(() => {
    setSaveState('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
  }, [])

  const patchSettings = useCallback(
    async (patch: Record<string, unknown>): Promise<boolean> => {
      setSaveState('saving')
      try {
        const res = await fetch(`/api/games/${gameCode}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostToken, ...patch }),
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

  const onPointsChange = (next: number) => {
    if (saveState === 'saving' || next === pointsToWin) return
    const previous = pointsToWin
    setPointsToWin(next)
    void patchSettings({ ping_pong_points_to_win: next }).then((ok) => {
      if (!ok) setPointsToWin(previous)
    })
  }

  const onTimeChange = (next: number) => {
    if (saveState === 'saving' || next === gameDuration) return
    const previous = gameDuration
    setGameDuration(next)
    void patchSettings({ game_duration_seconds: next }).then((ok) => {
      if (!ok) setGameDuration(previous)
    })
  }

  const pointsOptions = useMemo(() => PING_PONG_POINTS_OPTIONS.map((pts) => ({ value: pts, label: `${pts} pts` })), [])
  const timeOptions = useMemo(
    () => PING_PONG_GAME_DURATION_OPTIONS.map((sec) => ({ value: sec, label: formatPingPongDuration(sec) })),
    []
  )

  const summary = `${pointsToWin} points to win${gameDuration > 0 ? `, ${formatPingPongDuration(gameDuration)} timer` : ''}`
  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection status={statusLabel} summary={summary}>
      <div className="space-y-4">
        <HostLobbySettingBlock title="Points to win">
          <HostLobbyOptionChips value={pointsToWin} options={pointsOptions} onChange={onPointsChange} />
        </HostLobbySettingBlock>

        <HostLobbySettingBlock title="Match Timer">
          <HostLobbyOptionChips value={gameDuration} options={timeOptions} onChange={onTimeChange} />
        </HostLobbySettingBlock>
      </div>
    </HostLobbySettingsSection>
  )
}
