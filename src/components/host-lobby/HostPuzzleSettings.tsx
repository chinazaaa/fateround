'use client'

import { useState } from 'react'
import type { Game } from '@/types'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { crosswordThemeOptions } from '@/lib/crossword-puzzles'
import { wordSearchThemeOptions } from '@/lib/word-search-puzzles'
import { wordScrambleThemeOptions } from '@/lib/word-scramble-puzzles'
import { useToast } from '@/components/ui/Toast'

const DIFFICULTIES: { value: string; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

/**
 * Lobby editor for a Crossword / Word Search puzzle's word theme + difficulty. These live on
 * the game and are only read when the round is generated at start, so they're editable while
 * waiting. Saves via the shared lobby-settings route (server re-validates + enforces waiting).
 */
export function HostPuzzleSettings({
  gameCode,
  hostToken,
  game,
  onGameUpdate,
  kind,
}: {
  gameCode: string
  hostToken: string
  game: Game
  onGameUpdate: (game: Game) => void
  kind: 'crossword' | 'word_search' | 'word_scramble'
}) {
  const { error: toastError } = useToast()
  const [saving, setSaving] = useState(false)

  if (game.status !== 'waiting') return null

  const themeField = `${kind}_theme`
  const diffField = `${kind}_difficulty`
  const themeSource =
    kind === 'crossword'
      ? crosswordThemeOptions()
      : kind === 'word_search'
        ? wordSearchThemeOptions()
        : wordScrambleThemeOptions()
  const themeOptions = themeSource.map((t) => ({ value: t.id, label: t.label }))
  const g = game as unknown as Record<string, string | null | undefined>
  const currentTheme = g[themeField] ?? themeOptions[0]?.value ?? ''
  const currentDifficulty = g[diffField] ?? 'medium'

  const patch = async (body: Record<string, string>) => {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/lobby-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save settings')
      if (data.game) onGameUpdate(data.game)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <HostLobbySettingBlock title="Theme" className="sm:col-span-2">
        <HostLobbyOptionChips
          value={currentTheme}
          options={themeOptions}
          onChange={(v) => void patch({ [themeField]: String(v) })}
          disabled={saving}
        />
      </HostLobbySettingBlock>
      <HostLobbySettingBlock title="Difficulty">
        <HostLobbyOptionChips
          value={currentDifficulty}
          options={DIFFICULTIES}
          onChange={(v) => void patch({ [diffField]: String(v) })}
          disabled={saving}
        />
      </HostLobbySettingBlock>
    </>
  )
}
