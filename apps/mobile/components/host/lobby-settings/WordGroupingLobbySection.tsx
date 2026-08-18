import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, GameType } from '@fateround/shared'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { fetchLibraryPack, fetchLibraryPacks, type LibraryPackSummary } from '@/lib/api'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

/**
 * Mirrors web `WordGroupingLobbySettings` — only Platform vs Library. Picking a pack persists
 * the pool immediately (via the shared onChange → save flow), same as the create page. There's
 * no "Your own" custom upload here on purpose — WG doesn't support host CSV mid-lobby on web
 * either.
 */

export type WordGroupingSource = 'platform' | 'library'

export type WordGroupingLobbyState = {
  source: WordGroupingSource
  customQuestions: unknown[]
  libraryPackTitle: string | null
}

export function isWordGroupingLobbyGame(gameType: GameType): boolean {
  return gameType === 'word_grouping'
}

export function wordGroupingStateFromGame(game: Game): WordGroupingLobbyState {
  const isCustom =
    game.question_source === 'custom' && Array.isArray(game.custom_questions) && game.custom_questions.length > 0
  return {
    source: isCustom ? 'library' : 'platform',
    customQuestions: isCustom ? (game.custom_questions as unknown[]) : [],
    libraryPackTitle: null,
  }
}

const SOURCE_OPTIONS: { value: WordGroupingSource; label: string }[] = [
  { value: 'platform', label: 'Platform' },
  { value: 'library', label: 'Library' },
]

type Props = {
  value: WordGroupingLobbyState
  onChange: (patch: Partial<WordGroupingLobbyState>) => void
}

export function WordGroupingLobbySection({ value, onChange }: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [packs, setPacks] = useState<LibraryPackSummary[] | null>(null)
  const [loadingPacks, setLoadingPacks] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    if (value.source !== 'library') return
    let alive = true
    setLoadingPacks(true)
    setError(null)
    fetchLibraryPacks('word_grouping')
      .then((data) => {
        if (alive) setPacks(data)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Could not load packs')
      })
      .finally(() => {
        if (alive) setLoadingPacks(false)
      })
    return () => {
      alive = false
    }
  }, [value.source])

  const onSourceChange = (next: WordGroupingSource) => {
    if (next === value.source) return
    if (next === 'platform') {
      onChange({ source: 'platform', customQuestions: [], libraryPackTitle: null })
    } else {
      onChange({ source: next })
    }
  }

  const onPickPack = async (pack: LibraryPackSummary) => {
    if (loadingId) return
    setLoadingId(pack.id)
    setError(null)
    try {
      const full = await fetchLibraryPack(pack.id)
      const questions = Array.isArray(full.questions) ? (full.questions as unknown[]) : []
      if (questions.length < 4) {
        setError('Pack needs at least 4 puzzles')
        return
      }
      onChange({ customQuestions: questions, libraryPackTitle: full.title })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load pack')
    } finally {
      setLoadingId(null)
    }
  }

  const loadedCount = value.source === 'library' ? value.customQuestions.length : 0

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text style={styles.label}>Puzzle source</Text>
        <SegmentedControl
          value={value.source}
          onChange={(next) => onSourceChange(next as WordGroupingSource)}
          options={SOURCE_OPTIONS}
        />
      </View>

      {value.source === 'library' ? (
        <View style={styles.field}>
          <Text style={styles.label}>Library pack</Text>
          {loadingPacks ? (
            <View style={styles.centered}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : !packs || packs.length === 0 ? (
            <Text style={styles.empty}>No community packs for this game yet.</Text>
          ) : (
            <View style={styles.list}>
              {packs.map((pack) => {
                const active = loadingId === pack.id || value.libraryPackTitle === pack.title
                return (
                  <Pressable
                    key={pack.id}
                    style={[styles.card, active && styles.cardActive]}
                    onPress={() => void onPickPack(pack)}
                    disabled={!!loadingId}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {pack.title}
                      </Text>
                      {loadingId === pack.id ? (
                        <ActivityIndicator color={theme.primaryMuted} size="small" />
                      ) : (
                        <Text style={styles.cardCount}>{pack.question_count}</Text>
                      )}
                    </View>
                    {pack.description ? (
                      <Text style={styles.cardDesc} numberOfLines={2}>
                        {pack.description}
                      </Text>
                    ) : null}
                    <Text style={styles.cardAuthor}>by {pack.author_name}</Text>
                  </Pressable>
                )
              })}
            </View>
          )}
          {loadedCount > 0 ? (
            <Text style={styles.status}>
              ✓ {loadedCount} puzzle{loadedCount === 1 ? '' : 's'} loaded
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    field: { gap: theme.space.xs },
    label: { color: theme.text, fontSize: 14, fontWeight: '600' },
    centered: { paddingVertical: theme.space.lg, alignItems: 'center' },
    list: { gap: theme.space.sm },
    empty: { color: theme.textFaint, fontSize: 14, lineHeight: 20 },
    error: { color: theme.error, fontSize: 13 },
    status: { color: theme.success, fontSize: 12, fontWeight: '600' },
    card: {
      backgroundColor: theme.bgElevated,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.md,
      padding: theme.space.md,
      gap: 4,
    },
    cardActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.sm,
    },
    cardTitle: { color: theme.text, fontSize: 15, fontWeight: '800', flex: 1 },
    cardCount: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700' },
    cardDesc: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
    cardAuthor: { color: theme.textFaint, fontSize: 12 },
  })
