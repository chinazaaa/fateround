import { useCallback, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ListRow } from '@/components/ui/ListRow'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { centeredContent } from '@/constants/layout'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { fetchProfileTrophies, type TrophyGroup, type TrophyItem } from '@/lib/profile-api'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'

/**
 * Per-game trophy grid.
 *
 * Reached from a ListRow tap on /profile. Uses the same `/api/profile/trophies`
 * endpoint the web trophy case reads, scoped to one game type — bronze at the
 * bottom, platinum at the top, hidden trophies stay hidden until earned
 * (server enforces this, not CSS).
 *
 * A locked trophy shows a progress fraction (e.g. "3/10") when the criteria
 * expose one; a hidden unearned trophy shows "Secret trophy" and no progress.
 * Rarity percentage renders on earned trophies so a player can brag about the
 * really uncommon ones.
 */
export default function PerGameTrophiesScreen() {
  const router = useRouter()
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const { gameType } = useLocalSearchParams<{ gameType: string }>()
  const [group, setGroup] = useState<TrophyGroup | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!gameType) return
    const { groups } = await fetchProfileTrophies(gameType)
    setGroup(groups[0] ?? null)
    setLoading(false)
  }, [gameType])

  // Trophies unlock server-side at game finish, so a mount-only fetch showed pre-game
  // counts until the app was restarted. Refetch on focus and on app resume.
  useRefreshOnFocus(load)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }, [load])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          style={styles.backBtn}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.pageTitle} numberOfLines={1}>
          {group?.label ?? 'Trophies'}
        </Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.primaryMuted} />
        }
      >
        {loading ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : !group ? (
          <Text style={styles.empty}>No trophies for this game yet.</Text>
        ) : (
          <>
            <SurfaceCard elevation="raised" style={styles.progressCard}>
              <Text style={styles.progressLabel}>Earned</Text>
              <Text style={styles.progressValue}>
                {group.earned}
                <Text style={styles.progressOf}> / {group.total}</Text>
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${group.total > 0 ? (group.earned / group.total) * 100 : 0}%` },
                  ]}
                />
              </View>
            </SurfaceCard>

            <SurfaceCard padding={0} gap={0}>
              {group.trophies.map((t, i) => (
                <TrophyRow key={t.id} trophy={t} divider={i < group.trophies.length - 1} />
              ))}
            </SurfaceCard>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function TrophyRow({ trophy, divider }: { trophy: TrophyItem; divider: boolean }) {
  const styles = useThemedStyles(makeStyles)
  const tierGlyph = TIER_GLYPH[trophy.tier] ?? '·'
  const tierColor = TIER_COLOR[trophy.tier] ?? '#888'
  // Earned trophies use their tier color at full intensity; unearned dim the
  // background + border so the row scans as "not yet" without needing to read.
  const earned = trophy.earned
  const tierBg = earned ? `${tierColor}33` : `${tierColor}11`
  const tierBorder = earned ? `${tierColor}88` : `${tierColor}33`
  const earnedDate = formatEarnedDate(trophy.earnedAt)

  return (
    <ListRow
      divider={divider}
      left={
        <View style={[styles.tier, { backgroundColor: tierBg, borderColor: tierBorder, opacity: earned ? 1 : 0.55 }]}>
          <Text style={[styles.tierGlyph, { color: tierColor }]}>{tierGlyph}</Text>
          {earned ? (
            <View style={[styles.earnedBadge, { borderColor: tierColor }]}>
              <Text style={[styles.earnedBadgeText, { color: tierColor }]}>✓</Text>
            </View>
          ) : null}
        </View>
      }
      title={<Text style={[styles.trophyTitle, !earned && styles.trophyTitleLocked]}>{trophy.title}</Text>}
      subtitle={
        <View style={styles.subtitleRow}>
          <Text style={styles.trophyDesc} numberOfLines={2}>
            {trophy.description}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.trophyPoints}>{trophy.points} pts</Text>
            {earned ? (
              <>
                {earnedDate ? <Text style={styles.trophyEarnedDate}>Earned {earnedDate}</Text> : null}
                {trophy.rarityPct != null ? (
                  <Text style={styles.trophyRarity}>{trophy.rarityPct}% of players</Text>
                ) : null}
              </>
            ) : trophy.progress > 0 ? (
              <Text style={styles.trophyProgress}>{Math.round(trophy.progress * 100)}%</Text>
            ) : (
              <Text style={styles.trophyProgress}>Not yet</Text>
            )}
          </View>
        </View>
      }
    />
  )
}

function formatEarnedDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

const TIER_GLYPH: Record<string, string> = {
  bronze: '●',
  silver: '●',
  gold: '●',
  platinum: '◆',
}

const TIER_COLOR: Record<string, string> = {
  bronze: '#b57652',
  silver: '#c0c4cf',
  gold: '#f0c74a',
  platinum: '#8ac8ff',
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space.md,
      paddingVertical: theme.space.sm,
    },
    topBarSpacer: { width: 44 },
    pageTitle: {
      color: theme.text,
      fontSize: theme.type.section.size,
      fontWeight: theme.type.section.weight,
      flex: 1,
      textAlign: 'center',
      paddingHorizontal: theme.space.sm,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backGlyph: { color: theme.text, fontSize: 28, fontWeight: '400' },
    container: {
      padding: theme.space.md,
      gap: theme.space.md,
      paddingBottom: theme.space.xl,
      ...centeredContent,
    },
    empty: {
      color: theme.textMuted,
      fontSize: theme.type.body.size,
      paddingVertical: theme.space.xl,
      textAlign: 'center',
    },
    progressCard: { alignItems: 'center', gap: theme.space.sm },
    progressLabel: {
      color: theme.textMuted,
      fontSize: theme.type.caption.size,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    progressValue: {
      color: theme.text,
      fontSize: theme.type.display.size,
      lineHeight: theme.type.display.lineHeight,
      fontWeight: theme.type.display.weight,
    },
    progressOf: { color: theme.textMuted, fontSize: theme.type.title.size, fontWeight: '600' },
    progressBar: {
      alignSelf: 'stretch',
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.border,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: theme.primary },
    tier: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tierGlyph: { fontSize: 18 },
    earnedBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: theme.bg,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    earnedBadgeText: { fontSize: 10, fontWeight: '800', lineHeight: 12 },
    trophyTitle: { color: theme.text, fontSize: theme.type.section.size, fontWeight: theme.type.section.weight },
    trophyTitleLocked: { color: theme.textMuted },
    subtitleRow: { gap: 4 },
    trophyDesc: { color: theme.textMuted, fontSize: theme.type.caption.size, lineHeight: 16 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, marginTop: 2 },
    trophyPoints: { color: theme.primaryMuted, fontSize: theme.type.caption.size, fontWeight: '700' },
    trophyEarnedDate: { color: theme.primary, fontSize: theme.type.caption.size, fontWeight: '700' },
    trophyRarity: { color: theme.textFaint, fontSize: theme.type.caption.size },
    trophyProgress: { color: theme.textFaint, fontSize: theme.type.caption.size },
  })
