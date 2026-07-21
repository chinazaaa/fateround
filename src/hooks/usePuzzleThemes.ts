'use client'

import { useEffect, useState } from 'react'

export type PuzzleThemeOption = {
  id: string
  name: string
  difficulty: 'easy' | 'medium' | 'hard' | null
  entry_count: number
}

const PUZZLE_GAME_TYPES = ['crossword', 'word_search', 'word_scramble']

/**
 * Admin-authored themes for the create-game dropdown. Returns [] for non-puzzle game types.
 * These carry only metadata (name/difficulty/count) — the word pool stays server-side and is
 * folded into the game at create by POST /api/games via `puzzle_theme_id`.
 */
export function usePuzzleThemes(gameType: string | undefined): PuzzleThemeOption[] {
  const [themes, setThemes] = useState<PuzzleThemeOption[]>([])
  useEffect(() => {
    if (!gameType || !PUZZLE_GAME_TYPES.includes(gameType)) {
      setTimeout(() => setThemes([]), 0)
      return
    }
    let cancelled = false
    fetch(`/api/puzzle-themes?game_type=${gameType}`)
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

/** The `pt:<uuid>` value scheme lets one <select> hold either a built-in id or an admin theme. */
export const PUZZLE_THEME_VALUE_PREFIX = 'pt:'
export function puzzleThemeIdFromValue(value: string): string | undefined {
  return value.startsWith(PUZZLE_THEME_VALUE_PREFIX) ? value.slice(PUZZLE_THEME_VALUE_PREFIX.length) : undefined
}
