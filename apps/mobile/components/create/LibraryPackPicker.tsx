import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { fetchLibraryPack, fetchLibraryPacks, type LibraryPackSummary } from '@/lib/api'
import { packQuestionsToState, type CustomContentState } from '@/lib/create-settings/custom-content'
import { theme } from '@/constants/theme'

type Props = {
  gameType: GameType
  custom: CustomContentState
  onChange: (patch: Partial<CustomContentState>) => void
}

export function LibraryPackPicker({ gameType, custom, onChange }: Props) {
  const [packs, setPacks] = useState<LibraryPackSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setPacks(null)
    setError(null)
    fetchLibraryPacks(gameType)
      .then((data) => {
        if (alive) setPacks(data)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Could not load packs')
      })
    return () => {
      alive = false
    }
  }, [gameType])

  const selectPack = async (pack: LibraryPackSummary) => {
    if (loadingId) return
    setLoadingId(pack.id)
    setError(null)
    try {
      const full = await fetchLibraryPack(pack.id)
      onChange(packQuestionsToState(gameType, full.questions, full.title))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load pack')
    } finally {
      setLoadingId(null)
    }
  }

  if (packs === null && !error) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.primary} />
      </View>
    )
  }

  if (error) {
    return <Text style={styles.error}>{error}</Text>
  }

  if (!packs || packs.length === 0) {
    return <Text style={styles.empty}>No community packs for this game yet — try “Your own”.</Text>
  }

  return (
    <View style={styles.list}>
      {custom.libraryPackTitle ? (
        <Text style={styles.selected}>Loaded: {custom.libraryPackTitle}</Text>
      ) : null}
      {packs.map((pack) => {
        const active = custom.libraryPackTitle === pack.title
        return (
          <Pressable
            key={pack.id}
            style={[styles.card, active && styles.cardActive]}
            onPress={() => void selectPack(pack)}
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
  )
}

const styles = StyleSheet.create({
  centered: { paddingVertical: theme.space.lg, alignItems: 'center' },
  error: { color: theme.error, fontSize: 13 },
  empty: { color: theme.textFaint, fontSize: 14, lineHeight: 20 },
  list: { gap: theme.space.sm },
  selected: { color: theme.success, fontSize: 13, fontWeight: '700' },
  card: {
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    gap: 4,
  },
  cardActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.sm },
  cardTitle: { color: theme.text, fontSize: 15, fontWeight: '800', flex: 1 },
  cardCount: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700' },
  cardDesc: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
  cardAuthor: { color: theme.textFaint, fontSize: 12 },
})
