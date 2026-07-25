import type { GameType } from '@fateround/shared'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { gameLabel } from '@/lib/mobile-registry'
import { GAME_CATEGORIES, gameTypeCategory, gameTypeMeta, type GameCategory } from '@/lib/game-type-meta'
import { isMatureGame, MATURE_BADGE_LABEL } from '@/lib/game-maturity'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  options: GameType[]
  value: GameType
  onChange: (type: GameType) => void
}

type Filter = GameCategory | 'all'

/** Alt names people search for that aren't in a game's label/blurb — e.g. "draughts" for Checkers. */
const SEARCH_ALIASES: Partial<Record<GameType, string[]>> = {
  checkers: ['draughts'],
}

export function GameTypePicker({ options, value, onChange }: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const trimmed = query.trim().toLowerCase()

  // Only show category chips that actually have games in this list.
  const chips = useMemo(() => {
    const present = new Set(options.map((t) => gameTypeCategory(t)))
    return GAME_CATEGORIES.filter((c) => present.has(c.key))
  }, [options])

  const visible = useMemo(() => {
    if (trimmed) {
      // Searching ignores the active chip so a match is never hidden.
      return options.filter((t) => {
        const meta = gameTypeMeta(t)
        return (
          gameLabel(t).toLowerCase().includes(trimmed) ||
          meta.blurb.toLowerCase().includes(trimmed) ||
          (SEARCH_ALIASES[t] ?? []).some((alias) => alias.includes(trimmed))
        )
      })
    }
    if (filter === 'all') return options
    return options.filter((t) => gameTypeCategory(t) === filter)
  }, [options, trimmed, filter])

  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search games…"
        placeholderTextColor={theme.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />

      {!trimmed ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          {chips.map((c) => (
            <FilterChip key={c.key} label={c.label} active={filter === c.key} onPress={() => setFilter(c.key)} />
          ))}
        </ScrollView>
      ) : null}

      {visible.length === 0 ? (
        <Text style={styles.empty}>No games match “{query.trim()}”.</Text>
      ) : (
        <View style={styles.grid}>
          {visible.map((type) => {
            const selected = type === value
            const meta = gameTypeMeta(type)
            return (
              <Pressable
                key={type}
                style={[styles.tile, selected && styles.tileSelected]}
                onPress={() => onChange(type)}
              >
                <Text style={styles.emoji}>{meta.emoji}</Text>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, selected && styles.nameSelected]} numberOfLines={2}>
                    {gameLabel(type)}
                  </Text>
                  {isMatureGame(type) && (
                    <View style={styles.matureBadge}>
                      <Text style={styles.matureBadgeText}>{MATURE_BADGE_LABEL}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.blurb} numberOfLines={2}>
                  {meta.blurb}
                </Text>
              </Pressable>
            )
          })}
        </View>
      )}
    </View>
  )
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.sm },
    search: {
      backgroundColor: theme.bgElevated,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: theme.space.md,
      paddingVertical: 12,
      color: theme.text,
      fontSize: 15,
    },
    chipRow: {
      gap: theme.space.xs,
      paddingVertical: 2,
      paddingRight: theme.space.md,
    },
    chip: {
      paddingHorizontal: theme.space.md,
      paddingVertical: 8,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
    },
    chipActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primarySoft,
    },
    chipText: { color: theme.textMuted, fontSize: 13, fontWeight: '700' },
    chipTextActive: { color: theme.primaryMuted },
    empty: {
      color: theme.textMuted,
      fontSize: 14,
      paddingVertical: theme.space.md,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.space.sm,
    },
    tile: {
      width: '48%',
      flexGrow: 1,
      minWidth: '46%',
      backgroundColor: theme.bgElevated,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.md,
      gap: 4,
      minHeight: 108,
    },
    tileSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.primarySoft,
    },
    emoji: { fontSize: 26, marginBottom: 2 },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    name: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 20,
      flexShrink: 1,
    },
    nameSelected: { color: theme.primaryMuted },
    matureBadge: {
      backgroundColor: theme.primarySoft,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    matureBadgeText: {
      color: theme.error,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    blurb: {
      color: theme.textFaint,
      fontSize: 12,
      lineHeight: 16,
    },
  })
