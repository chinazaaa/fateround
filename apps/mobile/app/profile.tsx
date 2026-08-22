import { useCallback, useEffect, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ListRow } from '@/components/ui/ListRow'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { StreakStatusCard } from '@/components/profile/StreakStatusCard'
import { ProfileStatsTab } from '@/components/profile/ProfileStatsTab'
import { SettingsButton } from '@/components/ui/SettingsSheet'
import { centeredContent } from '@/constants/layout'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { fetchProfileGames, type ProfileGameRow, type ProfileMe } from '@/lib/profile-api'

/**
 * Profile screen — trophy case + per-game stats surface.
 *
 * Signing IN (email + OTP) still lives in the `ProfileChip` sheet on Home — that flow
 * works and doesn't need a second implementation. Everything else about the account —
 * display name, voice-chat default, sign out — is in `AccountSettingsSection` at the
 * bottom of this screen, mirroring web's `/profile` → Settings tab. Before that existed,
 * mobile had no account settings surface at all: renaming was reachable only from the
 * daily-challenge name prompt, the voice-chat default was unreachable, and sign-out was
 * behind "Not you? Switch" on a Home-screen chip.
 *
 * Signed-out (anonymous) state renders identically — anon players still
 * have real trophy stats — so there's no separate "guest" layout.
 *
 * Phase 1 of docs/mobile-revamp-plan.md. Follow-ups:
 *   - /profile/trophies/[gameType] for per-game trophy grid (row tap target).
 *   - Handle edit could migrate to /profile in Phase 4 once the flow stabilises.
 */
export default function ProfileScreen() {
  const router = useRouter()
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [profile, setProfile] = useState<ProfileMe | null>(null)
  const [games, setGames] = useState<ProfileGameRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<'trophies' | 'stats'>('trophies')

  const load = useCallback(async () => {
    const { profile, games } = await fetchProfileGames()
    setProfile(profile)
    setGames(games)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Refresh on return so a trophy won in another screen shows up next time we
  // land here without a manual pull.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }, [load])

  const signedIn = !!profile && !profile.is_anonymous
  const handle = profile?.handle?.trim() || (signedIn ? 'Player' : 'Guest')
  const totals = {
    points: profile?.trophy_points ?? 0,
    level: profile?.trophy_level ?? 1,
    current: profile?.current_streak ?? 0,
    best: profile?.longest_streak ?? 0,
    // Freezes were stored per profile and shown nowhere, so a player had no way to learn
    // forgiveness existed — which is most of its retention value.
    freezes: profile?.streak_freezes ?? 0,
  }

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
        <Text style={styles.pageTitle}>Profile</Text>
        {/* Settings is reachable from every tab, rather than being a tab that navigates away —
            tabs switch content, destinations don't belong in them. Matches Home's gear. */}
        <SettingsButton variant="screen" />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.primaryMuted} />
        }
      >
        {/* Header card: name + auth state hint. Renaming, the voice-chat default and
            sign-out live in the Settings section at the bottom of this screen; signing IN
            (email + OTP) is still the ProfileChip sheet on Home. */}
        <SurfaceCard elevation="raised">
          <View style={styles.headerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{handle.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.headerBody}>
              <Text style={styles.handle} numberOfLines={1}>
                {handle}
              </Text>
              <Text style={styles.handleHint}>
                {signedIn
                  ? profile?.username
                    ? `@${profile.username}`
                    : 'Signed in'
                  : 'Guest — sign in from Home to save progress across devices'}
              </Text>
            </View>
          </View>
        </SurfaceCard>

        {/* Totals: two rows of two, so the four glance-numbers stay one
            tap-target wide even on the narrowest phones. */}
        <View style={styles.totalsRow}>
          <StatTile label="Trophy points" value={totals.points} />
          <StatTile label="Level" value={totals.level} />
        </View>
        <View style={styles.totalsRow}>
          <StatTile label="Current streak" value={`${totals.current}d`} />
          <StatTile
            label="Best streak"
            value={totals.freezes > 0 ? `${totals.best}d · ${totals.freezes}❄` : `${totals.best}d`}
          />
        </View>

        {/* Only renders when the streak is actually in danger — see StreakStatusCard. */}
        <StreakStatusCard profile={profile} />

        {/* Trophies | Stats. Web has a third tab for Settings; here that is the ⚙ in the top
            bar instead — a tab that teleports out of the tab set is a worse trade than an
            always-visible destination. See docs/mobile-ia-audit-2026-08.md. */}
        <View style={styles.tabs}>
          {(['trophies', 'stats'] as const).map((key) => (
            <Pressable
              key={key}
              style={[styles.tab, tab === key && styles.tabActive]}
              onPress={() => setTab(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === key }}
            >
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
                {key === 'trophies' ? 'Trophies' : 'Stats'}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'stats' ? <ProfileStatsTab games={games} /> : null}

        {tab === 'trophies' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your games</Text>
            {loading ? (
              <Text style={styles.empty}>Loading…</Text>
            ) : games.length === 0 ? (
              <Text style={styles.empty}>Finish a game to see it here.</Text>
            ) : (
              <SurfaceCard padding={0} gap={0}>
                {games.map((row, i) => (
                  <ListRow
                    key={row.gameType}
                    onPress={() => router.push(`/profile/trophies/${row.gameType}` as never)}
                    divider={i < games.length - 1}
                    left={
                      <View style={styles.gameEmoji}>
                        <Text style={styles.gameEmojiText}>{row.emoji}</Text>
                      </View>
                    }
                    title={row.label}
                    subtitle={`${row.gamesWon} won · ${row.gamesPlayed} played · ${row.earned}/${row.total} trophies`}
                    right={<Text style={styles.chevron}>›</Text>}
                  />
                ))}
              </SurfaceCard>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <SurfaceCard style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </SurfaceCard>
  )
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
    pageTitle: {
      color: theme.text,
      fontSize: theme.type.section.size,
      fontWeight: theme.type.section.weight,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backGlyph: { color: theme.text, fontSize: 28, fontWeight: '400' },
    container: {
      padding: theme.space.md,
      gap: theme.space.md,
      paddingBottom: theme.space.xl,
      ...centeredContent,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: { color: '#fff', fontSize: theme.type.title.size, fontWeight: '800' },
    headerBody: { flex: 1, gap: 2 },
    handle: {
      color: theme.text,
      fontSize: theme.type.title.size,
      lineHeight: theme.type.title.lineHeight,
      fontWeight: theme.type.title.weight,
    },
    handleHint: { color: theme.textMuted, fontSize: theme.type.caption.size },
    totalsRow: { flexDirection: 'row', gap: theme.space.sm },
    tile: { flex: 1, alignItems: 'center', paddingVertical: theme.space.md },
    tileValue: {
      color: theme.text,
      fontSize: theme.type.display.size,
      lineHeight: theme.type.display.lineHeight,
      fontWeight: theme.type.display.weight,
      letterSpacing: theme.type.display.letterSpacing,
    },
    tileLabel: { color: theme.textMuted, fontSize: theme.type.caption.size, marginTop: 2 },
    tabs: {
      flexDirection: 'row',
      gap: 4,
      padding: 4,
      borderRadius: 12,
      backgroundColor: theme.surfaceHover,
    },
    tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
    tabActive: { backgroundColor: theme.primary },
    tabText: { color: theme.textSecondary, fontSize: theme.type.body.size, fontWeight: '700' },
    // White on the solid rose tab — intentional, correct in both schemes.
    tabTextActive: { color: '#fff', fontWeight: '800' },
    section: { gap: theme.space.sm },
    sectionTitle: {
      color: theme.text,
      fontSize: theme.type.title.size,
      fontWeight: theme.type.title.weight,
      letterSpacing: theme.type.title.letterSpacing,
    },
    empty: {
      color: theme.textMuted,
      fontSize: theme.type.body.size,
      paddingVertical: theme.space.md,
      textAlign: 'center',
    },
    gameEmoji: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.md,
      backgroundColor: theme.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gameEmojiText: { fontSize: 22 },
    chevron: { color: theme.textFaint, fontSize: 24, fontWeight: '300' },
  })
