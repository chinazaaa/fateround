'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lobbyMaxPlayersFromGame, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import {
  MATCHING_PAIRS_GRID_SIZES,
  MATCHING_PAIRS_GAME_DURATION_OPTIONS,
  formatMatchingPairsGridSize,
  formatMatchingPairsGameDuration,
} from '@/lib/memory-match'
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

/**
 * Matching Pairs host lobby settings panel.
 * Mirrors HostSudokuLobbyPanel in structure:
 *   - Max players chip selector
 *   - Grid size chip selector (Standard 4×4 / Large 8×4)
 *   - Late-join / viewers field
 */
export function HostMatchingPairsLobbyPanel({ gameCode, hostToken, game, playerCount, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(20)
  // Grid size is stored in game_duration_seconds (0=Standard, 16=Large) — a zero-cost
  // config reuse pattern also used by other games that need one integer setting without
  // a new DB column. 0 maps to 8 pairs (Standard); anything else is 16 pairs (Large).
  const [gridSizePairs, setGridSizePairs] = useState<8 | 16>(8)
  // Game time limit is stored in timer_seconds (0 = no limit).
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [roundsCount, setRoundsCount] = useState(1)
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
    setMaxPlayers(lobbyMaxPlayersFromGame('matching_pairs', game, limits))
    // Decode grid size: game_duration_seconds=0 → 8 pairs, =16 → 16 pairs.
    const raw = game.game_duration_seconds ?? 0
    setGridSizePairs(raw === 16 ? 16 : 8)
    // Decode game time limit: timer_seconds (0 = no limit).
    setTimerSeconds(game.timer_seconds ?? 0)
    setRoundsCount(game.rounds_count ?? 1)
  }, [game, limits])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const limitCfg = limits?.matching_pairs
  const minPlayers = limitCfg?.min ?? 1
  const maxCap = limitCfg?.max ?? 20

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

  const onGridSizeChange = (next: number) => {
    if (saveState === 'saving') return
    const previous = gridSizePairs
    const nextSize = next as 8 | 16
    setGridSizePairs(nextSize)
    // Store grid size in game_duration_seconds: 0 → 8 pairs, 16 → 16 pairs.
    void patchSettings({ game_duration_seconds: nextSize === 16 ? 16 : 0 }).then((ok) => {
      if (!ok) setGridSizePairs(previous)
    })
  }

  const onTimerSecondsChange = (next: number) => {
    if (saveState === 'saving') return
    const previous = timerSeconds
    setTimerSeconds(next)
    void patchSettings({ timer_seconds: next }).then((ok) => {
      if (!ok) setTimerSeconds(previous)
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

  const maxPlayerOptions = useMemo(
    () =>
      playerCountOptions(minPlayers, maxCap).map((n) => ({
        value: n,
        label: String(n),
      })),
    [maxCap, minPlayers]
  )

  const gridSizeOptions = useMemo(
    () =>
      MATCHING_PAIRS_GRID_SIZES.map((n) => ({
        value: n,
        label: formatMatchingPairsGridSize(n),
      })),
    []
  )

  const timerSecondsOptions = useMemo(
    () =>
      MATCHING_PAIRS_GAME_DURATION_OPTIONS.map((n) => ({
        value: n,
        label: formatMatchingPairsGameDuration(n),
      })),
    []
  )

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection
      status={statusLabel}
      summary={`${maxPlayers} max · ${formatMatchingPairsGridSize(gridSizePairs)} · ${formatMatchingPairsGameDuration(timerSeconds)} · ${roundsCount} round${roundsCount === 1 ? '' : 's'}`}
    >
      <HostLobbySettingBlock title={`Max players · ${playerCount} joined`}>
        <HostLobbyOptionChips value={maxPlayers} options={maxPlayerOptions} onChange={onMaxPlayersChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Grid size">
        <HostLobbyOptionChips value={gridSizePairs} options={gridSizeOptions} onChange={onGridSizeChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Game time limit">
        <HostLobbyOptionChips value={timerSeconds} options={timerSecondsOptions} onChange={onTimerSecondsChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Rounds">
        <HostLobbyOptionChips
          value={roundsCount}
          options={[
            { value: 1, label: '1' },
            { value: 2, label: '2' },
            { value: 3, label: '3' },
            { value: 5, label: '5' },
            { value: 10, label: '10' },
          ]}
          onChange={onRoundsCountChange}
        />
      </HostLobbySettingBlock>
    </HostLobbySettingsSection>
  )
}
