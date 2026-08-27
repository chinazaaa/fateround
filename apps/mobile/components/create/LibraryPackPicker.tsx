import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { GameType } from '@fateround/shared'
import { fetchLibraryPack, fetchLibraryPacks, type LibraryPackSummary } from '@/lib/api'
import { packQuestionsToState, type CustomContentState } from '@/lib/create-settings/custom-content'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameType: GameType
  custom: CustomContentState
  onChange: (patch: Partial<CustomContentState>) => void
}

export function LibraryPackPicker({ gameType, custom, onChange }: Props) {
  const theme = useTheme()
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)
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
    // Paid + unowned packs route to /shop instead of trying to load. The
    // server would refuse the load anyway; this mirrors the web
    // LibraryPackPicker's inline shop CTA (plan §"UI surfaces").
    const priced = (pack.price_coins ?? 0) > 0
    if (priced && !pack.owned) {
      router.push('/shop' as never)
      return
    }
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
      {custom.libraryPackTitle ? <Text style={styles.selected}>Loaded: {custom.libraryPackTitle}</Text> : null}
      {packs.map((pack) => {
        const active = custom.libraryPackTitle === pack.title
        const price = pack.price_coins ?? 0
        const priced = price > 0
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
            <View style={styles.cardFooter}>
              <Text style={styles.cardAuthor}>by {pack.author_name}</Text>
              {priced ? (
                pack.owned ? (
                  <Text style={styles.ownedBadge}>Owned</Text>
                ) : (
                  <Text style={styles.priceBadge}>🪙 {price.toLocaleString()}</Text>
                )
              ) : null}
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
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
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.sm },
    priceBadge: { color: theme.primary, fontSize: 12, fontWeight: '800' },
    ownedBadge: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
  })
