import { StyleSheet, Text, View } from 'react-native'
import type { Game } from '@fateround/shared'
import { CROSSWORD_THEME_OPTIONS } from '@fateround/shared/crossword'
import { WORD_SEARCH_THEME_OPTIONS } from '@fateround/shared/word-search'
import { WORD_SCRAMBLE_THEME_OPTIONS } from '@fateround/shared/word-scramble'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

function themeLabel(options: { id: string; label: string }[], id: string | null | undefined): string | null {
  if (!id) return null
  return options.find((o) => o.id === id)?.label ?? null
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'No time limit'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (s === 0) return `${m} min`
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Player-facing summary chips for a game's settings (theme / difficulty / time) so people
 * know what they're joining. Custom/library content packs hide the theme (there isn't one).
 */
export function gameInfoItems(game: Game | null | undefined): string[] {
  if (!game) return []
  const items: string[] = []
  const isCustomPool = game.question_source === 'custom'

  if (game.game_type === 'crossword') {
    if (!isCustomPool) {
      const label = themeLabel(CROSSWORD_THEME_OPTIONS, game.crossword_theme)
      if (label) items.push(label)
    }
    if (game.crossword_difficulty) items.push(capitalize(String(game.crossword_difficulty)))
  } else if (game.game_type === 'word_search') {
    if (!isCustomPool) {
      const label = themeLabel(WORD_SEARCH_THEME_OPTIONS, game.word_search_theme)
      if (label) items.push(label)
    }
    if (game.word_search_difficulty) items.push(capitalize(String(game.word_search_difficulty)))
  } else if (game.game_type === 'word_scramble') {
    if (!isCustomPool) {
      const label = themeLabel(WORD_SCRAMBLE_THEME_OPTIONS, game.word_scramble_theme)
      if (label) items.push(label)
    }
    if (game.word_scramble_difficulty) items.push(capitalize(String(game.word_scramble_difficulty)))
  }

  const duration = game.game_duration_seconds ?? game.timer_seconds
  if (typeof duration === 'number') items.push(formatDuration(duration))

  return items
}

/** Row of subtle pills built from {@link gameInfoItems}. Renders nothing when empty. */
export function GameInfoChips({ game }: { game: Game | null | undefined }) {
  const styles = useThemedStyles(makeStyles)
  const items = gameInfoItems(game)
  if (items.length === 0) return null
  return (
    <View style={styles.row}>
      {items.map((item, i) => (
        <Text key={i} style={styles.chip}>
          {item}
        </Text>
      ))}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      justifyContent: 'center',
    },
    chip: {
      backgroundColor: theme.bgElevated,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 999,
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      overflow: 'hidden',
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
  })
