'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AYO_TIME_OPTIONS } from '@/lib/ayo'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { useToast } from '@/components/ui/Toast'
import type { Game } from '@/types'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  onGameUpdate: (game: Game) => void
}

type SaveState = 'idle' | 'saving' | 'saved'

function shortAyoTimerLabel(seconds: number): string {
  if (!seconds) return 'Off'
  if (seconds === 30) return '30s'
  if (seconds === 180) return '3m'
  if (seconds === 300) return '5m'
  if (seconds === 600) return '10m'
  return `${seconds}s`
}

export function HostAyoLobbyPanel({ gameCode, hostToken, game, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const [isPublic, setIsPublic] = useState(game.is_public === true)
  const [turnTimer, setTurnTimer] = useState(game.timer_seconds ?? 0)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setIsPublic(game.is_public === true)
  }, [game.is_public])

  useEffect(() => {
    setTurnTimer(game.timer_seconds ?? 0)
  }, [game.timer_seconds])

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

  const onTurnTimerChange = (next: number) => {
    if (saveState === 'saving') return
    const previous = turnTimer
    setTurnTimer(next)
    void patchSettings({ timer_seconds: next }).then((ok) => {
      if (!ok) setTurnTimer(previous)
    })
  }

  const timerOptions = useMemo(
    () =>
      AYO_TIME_OPTIONS.map((s) => ({
        value: s,
        label: shortAyoTimerLabel(s),
      })),
    []
  )

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection status={statusLabel}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
        <HostLobbySettingBlock title="Rules" className="sm:col-span-2">
          <p className="text-xs text-white/60">
            Traditional Ayo Olopon. Sow anti-clockwise, relaying until your last seed lands in an empty house. When your
            last seed completes exactly four in any house — yours or your opponent’s — you win it. Once only eight seeds
            remain, the player who captures the first four takes the last four and the game ends. Most houses wins — if
            houses are equal, the most seeds captured breaks the tie.
          </p>
        </HostLobbySettingBlock>

        <HostLobbySettingBlock title="Time per player" className="sm:col-span-2">
          <HostLobbyOptionChips value={turnTimer} options={timerOptions} onChange={onTurnTimerChange} />
        </HostLobbySettingBlock>
      </div>
    </HostLobbySettingsSection>
  )
}
