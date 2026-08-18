'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  WORDLE_ROOM_TIMER_OPTIONS,
  WORDLE_ROOM_WORD_COUNT_OPTIONS,
  WORDLE_ROOM_DEFAULT_TIMER,
  WORDLE_ROOM_DEFAULT_WORD_COUNT,
  clampWordleRoomCategory,
} from '@/lib/wordle-room'
import type { WordleCategoryId } from '@/lib/daily-wordle'
import { lobbyMaxPlayersFromGame, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
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

const CATEGORY_OPTIONS = [
  { value: 'sports', label: 'Sports' },
  { value: 'food', label: 'Food & Drink' },
  { value: 'animals', label: 'Animals' },
  { value: 'technology', label: 'Technology' },
  { value: 'nature', label: 'Nature' },
  { value: 'music', label: 'Music' },
  { value: 'science', label: 'Science' },
  { value: 'clothing', label: 'Clothing & Fashion' },
  { value: 'travel', label: 'Travel & Places' },
  { value: 'general_english', label: 'General English' },
  { value: 'naija_slang', label: 'Naija Slang' },
]

function timerLabel(seconds: number): string {
  if (seconds === 0) return 'Untimed'
  if (seconds === 120) return '2 min'
  if (seconds === 300) return '5 min'
  if (seconds === 600) return '10 min'
  if (seconds === 900) return '15 min'
  return `${seconds}s`
}

export function HostWordleRoomLobbyPanel({ gameCode, hostToken, game, playerCount, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(20)
  const [category, setCategory] = useState<WordleCategoryId>('sports')
  const [wordCount, setWordCount] = useState(5)
  const [timer, setTimer] = useState(WORDLE_ROOM_DEFAULT_TIMER)
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
    setMaxPlayers(lobbyMaxPlayersFromGame('wordle_room', game, limits) ?? game.max_players ?? 20)
    setCategory(clampWordleRoomCategory(game.wordle_room_category))
    setWordCount(game.wordle_room_word_count ?? WORDLE_ROOM_DEFAULT_WORD_COUNT)
    setTimer(game.timer_seconds ?? WORDLE_ROOM_DEFAULT_TIMER)
  }, [game, limits])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const limitCfg = limits?.wordle_room
  const minPlayers = limitCfg?.min ?? 2
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

  const onCategoryChange = (next: string) => {
    const value = clampWordleRoomCategory(next)
    setCategory(value)
    void patchSettings({ wordle_room_category: value })
  }

  const onWordCountChange = (next: number) => {
    setWordCount(next)
    void patchSettings({ wordle_room_word_count: next })
  }

  const onTimerChange = (next: number) => {
    setTimer(next)
    void patchSettings({ timer_seconds: next })
  }

  const maxPlayerOptions = useMemo(
    () =>
      playerCountOptions(minPlayers, maxCap).map((n) => ({
        value: n,
        label: String(n),
      })),
    [maxCap, minPlayers]
  )

  const wordCountOptions = useMemo(
    () =>
      WORDLE_ROOM_WORD_COUNT_OPTIONS.map((n) => ({
        value: n,
        label: String(n),
      })),
    []
  )

  const timerOptions = useMemo(
    () =>
      WORDLE_ROOM_TIMER_OPTIONS.map((s) => ({
        value: s,
        label: timerLabel(s),
      })),
    []
  )

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection status={statusLabel}>
      <HostLobbySettingBlock title={`Max players · ${playerCount} joined`}>
        <HostLobbyOptionChips value={maxPlayers} options={maxPlayerOptions} onChange={onMaxPlayersChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Category">
        <HostLobbyOptionChips value={category} options={CATEGORY_OPTIONS} onChange={onCategoryChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Words in the race">
        <HostLobbyOptionChips value={wordCount} options={wordCountOptions} onChange={onWordCountChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title={`Whole-game timer · ${timerLabel(timer)}`}>
        <HostLobbyOptionChips value={timer} options={timerOptions} onChange={onTimerChange} />
      </HostLobbySettingBlock>
    </HostLobbySettingsSection>
  )
}
