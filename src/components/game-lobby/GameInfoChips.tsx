'use client'

import { crosswordThemeOptions } from '@/lib/crossword-puzzles'
import { wordSearchThemeOptions } from '@/lib/word-search-puzzles'
import { wordScrambleThemeOptions } from '@/lib/word-scramble-puzzles'

/** Built-in theme id -> its label; an admin theme stores its NAME in the column, so a value
 *  that isn't a known built-in id is shown as-is. */
function themeChip(options: { id: string; label: string }[], value: string): string {
  return options.find((o) => o.id === value)?.label ?? value
}

/** The subset of a game row this reads — kept loose so any game object can be passed. */
type GameMeta = {
  game_type?: string | null
  question_source?: string | null
  crossword_theme?: string | null
  crossword_difficulty?: string | null
  word_search_theme?: string | null
  word_search_difficulty?: string | null
  word_scramble_theme?: string | null
  word_scramble_difficulty?: string | null
  game_duration_seconds?: number | null
  timer_seconds?: number | null
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'No time limit'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (s === 0) return `${m} min`
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

/**
 * Player-facing summary of a game's settings — so people know what they're joining
 * before they commit. Returns short chips like "Theme · Animals", "Hard", "5 min".
 * Custom/library content packs hide the theme (there isn't one).
 */
export function gameInfoItems(game: GameMeta | null | undefined): string[] {
  if (!game) return []
  const items: string[] = []
  const isCustomPool = game.question_source === 'custom'
  const gt = game.game_type ?? ''

  if (gt === 'crossword') {
    if (!isCustomPool && game.crossword_theme) items.push(themeChip(crosswordThemeOptions(), game.crossword_theme))
    if (game.crossword_difficulty) items.push(capitalize(game.crossword_difficulty))
  } else if (gt === 'word_search') {
    if (!isCustomPool && game.word_search_theme) items.push(themeChip(wordSearchThemeOptions(), game.word_search_theme))
    if (game.word_search_difficulty) items.push(capitalize(game.word_search_difficulty))
  } else if (gt === 'word_scramble') {
    if (!isCustomPool && game.word_scramble_theme)
      items.push(themeChip(wordScrambleThemeOptions(), game.word_scramble_theme))
    if (game.word_scramble_difficulty) items.push(capitalize(game.word_scramble_difficulty))
  }

  const duration = game.game_duration_seconds ?? game.timer_seconds
  if (typeof duration === 'number') items.push(formatDuration(duration))

  return items
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Renders {@link gameInfoItems} as a row of subtle pills. Renders nothing when empty. */
export function GameInfoChips({
  game,
  className = '',
  align = 'center',
}: {
  game: GameMeta | null | undefined
  className?: string
  align?: 'center' | 'left'
}) {
  const items = gameInfoItems(game)
  if (items.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1.5 ${align === 'center' ? 'justify-center' : ''} ${className}`}>
      {items.map((item, i) => (
        <span
          key={i}
          className="rounded-full bg-[var(--surface-inset-bg)] px-2.5 py-1 text-xs font-semibold text-muted"
        >
          {item}
        </span>
      ))}
    </div>
  )
}
