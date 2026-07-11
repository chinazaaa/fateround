'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AYO_TIME_OPTIONS, parseAyoVariant } from '@/lib/ayo'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostThemePicker } from '@/components/host-lobby/HostThemePicker'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { gameSupportsViewerSetting } from '@/lib/viewers'
import { Chip, Toggle } from '@/components/ui/PageShell'
import { useToast } from '@/components/ui/Toast'
import type { AyoVariant, Game } from '@/types'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  onGameUpdate: (game: Game) => void
}

type SaveState = 'idle' | 'saving' | 'saved'

function formatAyoTimer(seconds: number): string {
  if (!seconds) return 'Casual'
  if (seconds === 30) return 'Ranked · 30s'
  if (seconds === 180) return '3m each'
  if (seconds === 300) return '5m each'
  if (seconds === 600) return '10m each'
  return `${seconds}s each`
}

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
  const [variant, setVariant] = useState<AyoVariant>(() => parseAyoVariant(game.ayo_variant))
  const [turnTimer, setTurnTimer] = useState(game.timer_seconds ?? 0)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setIsPublic(game.is_public === true)
  }, [game.is_public])

  useEffect(() => {
    setVariant(parseAyoVariant(game.ayo_variant))
    setTurnTimer(game.timer_seconds ?? 0)
  }, [game.ayo_variant, game.timer_seconds])

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

  const onVisibilityChange = (next: boolean) => {
    if (saveState === 'saving') return
    const previous = isPublic
    setIsPublic(next)
    void patchSettings({ is_public: next }).then((ok) => {
      if (!ok) setIsPublic(previous)
    })
  }

  const onVariantChange = (next: AyoVariant) => {
    if (next === variant || saveState === 'saving') return
    const previous = variant
    setVariant(next)
    void patchSettings({ ayo_variant: next }).then((ok) => {
      if (!ok) setVariant(previous)
    })
  }

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

  const summary = `${isPublic ? 'Public' : 'Private'} · ${variant === 'traditional' ? 'Traditional' : 'Oware'} · ${formatAyoTimer(turnTimer)}`
  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection status={statusLabel} summary={summary}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
        <HostLobbySettingBlock title="Visibility" className="sm:col-span-2">
          <Toggle
            label="Public game"
            description="List in Browse so anyone can find and join. Off keeps it invite-only via the share link."
            value={isPublic}
            onChange={onVisibilityChange}
          />
        </HostLobbySettingBlock>

        <HostLobbySettingBlock title="Rules" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            <Chip
              active={variant === 'traditional'}
              onClick={() => onVariantChange('traditional')}
              className="px-2.5 py-1.5 text-xs font-semibold"
            >
              Traditional
            </Chip>
            <Chip
              active={variant === 'oware'}
              onClick={() => onVariantChange('oware')}
              className="px-2.5 py-1.5 text-xs font-semibold"
            >
              Oware
            </Chip>
          </div>
          <p className="mt-1.5 text-xs text-white/60">
            {variant === 'traditional'
              ? 'Complete fours on your houses to win them. On opponent houses: your last seed wins for you; earlier seeds win for them.'
              : 'Capture 2s and 3s with linkage — most captured seeds wins the deal.'}
          </p>
        </HostLobbySettingBlock>

        <HostLobbySettingBlock title="Time per player" className="sm:col-span-2">
          <HostLobbyOptionChips value={turnTimer} options={timerOptions} onChange={onTurnTimerChange} />
        </HostLobbySettingBlock>

        <HostThemePicker gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={onGameUpdate} />
        {gameSupportsViewerSetting(game.game_type) && game.status === 'waiting' && (
          <HostLobbySettingBlock title="Late joiners" className="sm:col-span-2">
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
      </div>
    </HostLobbySettingsSection>
  )
}
