import { useEffect, useState } from 'react'
import { apiUrl } from '@/lib/config'

/**
 * Admin-authored puzzle themes for the create-game theme picker (mirrors the web hook). Metadata
 * only — the word pool stays server-side and is folded into the game at create via puzzle_theme_id.
 */
export type PuzzleThemeOption = {
  id: string
  name: string
  difficulty: 'easy' | 'medium' | 'hard' | null
  entry_count: number
}

const PUZZLE_GAME_TYPES = ['crossword', 'word_search', 'word_scramble']

/** A `pt:<id>` value in the theme picker means an admin theme (vs a built-in id). */
export const PUZZLE_THEME_VALUE_PREFIX = 'pt:'
export function puzzleThemeIdFromValue(value: string): string | undefined {
  return value.startsWith(PUZZLE_THEME_VALUE_PREFIX) ? value.slice(PUZZLE_THEME_VALUE_PREFIX.length) : undefined
}

export function usePuzzleThemes(gameType: string | undefined): PuzzleThemeOption[] {
  const [themes, setThemes] = useState<PuzzleThemeOption[]>([])
  useEffect(() => {
    if (!gameType || !PUZZLE_GAME_TYPES.includes(gameType)) {
      setThemes([])
      return
    }
    let cancelled = false
    fetch(apiUrl(`/api/puzzle-themes?game_type=${gameType}`))
      .then((r) => (r.ok ? r.json() : { themes: [] }))
      .then((j) => {
        if (!cancelled) setThemes((j.themes ?? []) as PuzzleThemeOption[])
      })
      .catch(() => {
        if (!cancelled) setThemes([])
      })
    return () => {
      cancelled = true
    }
  }, [gameType])
  return themes
}
