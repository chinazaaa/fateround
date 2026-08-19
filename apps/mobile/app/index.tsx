import { useCallback, useState } from 'react'
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { normalizeGameCode } from '@fateround/shared'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { BrowseGamesList } from '@/components/browse/BrowseGamesList'
import { SubscribeHomeBanner } from '@/components/notifications/SubscribeHomeBanner'
import { YourUpcomingGamesStrip } from '@/components/notifications/YourUpcomingGamesStrip'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { AppButton } from '@/components/ui/AppButton'
import { KeyboardFormScreen } from '@/components/ui/KeyboardFormScreen'
import { ListRow } from '@/components/ui/ListRow'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { SettingsButton } from '@/components/ui/SettingsSheet'
import { ProfileChip } from '@/components/profile/ProfileChip'
import { centeredContent } from '@/constants/layout'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { gameLabel } from '@/lib/mobile-registry'
import { getRecentGames, type RecentGame } from '@/lib/recent-games'

const RECENT_COLLAPSED_COUNT = 3

export default function HomeScreen() {
  const router = useRouter()
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [gameCode, setGameCode] = useState('')
  const [recent, setRecent] = useState<RecentGame[]>([])
  const [showAllRecent, setShowAllRecent] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadRecent = useCallback(async () => {
    setRecent(await getRecentGames())
  }, [])

  // Re-read whenever the home screen regains focus (e.g. returning from a game
  // just played) so the Recent list is always current without a manual reload.
  useFocusEffect(
    useCallback(() => {
      void loadRecent()
    }, [loadRecent])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadRecent()
    } finally {
      setRefreshing(false)
    }
  }, [loadRecent])

  const visibleRecent = showAllRecent ? recent : recent.slice(0, RECENT_COLLAPSED_COUNT)
  const hiddenRecentCount = recent.length - RECENT_COLLAPSED_COUNT

  const canJoin = normalizeGameCode(gameCode).length >= 4

  const onJoin = () => {
    const code = normalizeGameCode(gameCode)
    if (code.length < 4) return
    router.push(`/game/${code}`)
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AmbientBackground />
      <KeyboardFormScreen
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={theme.primaryMuted}
            colors={[theme.primary]}
          />
        }
      >
        <View style={styles.topBar}>
          <SettingsButton />
          <ProfileChip />
        </View>

        <View style={styles.hero}>
          <Text style={styles.kicker}>Party games</Text>
          <FateRoundLogo variant="stacked" width={200} />
          <Text style={styles.tagline}>Join friends with a code. No account, no fuss.</Text>
        </View>

        <SurfaceCard accent elevation="raised">
          <Text style={styles.cardLabel}>Join a game</Text>
          <TextInput
            style={styles.codeInput}
            placeholder="ABCD12"
            placeholderTextColor={theme.textFaint}
            value={gameCode}
            onChangeText={(value) => setGameCode(value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            returnKeyType="go"
            onSubmitEditing={onJoin}
          />
          <AppButton label="Join game" onPress={onJoin} disabled={!canJoin} size="lg" fullWidth haptic="medium" />
        </SurfaceCard>

        <View style={styles.actions}>
          <AppButton
            label="Create a game"
            tone="secondary"
            size="lg"
            fullWidth
            onPress={() => router.push('/create')}
          />
          <AppButton
            label="🗓️ Daily Challenges"
            tone="ghost"
            // Cast: expo-router's typed href doesn't know about the
            // /daily-challenges route registered in _layout.tsx.
            onPress={() => router.push('/daily-challenges' as never)}
          />
          <AppButton
            label="🏆 Leaderboards"
            tone="ghost"
            // Cast: expo-router's typed href doesn't know about the
            // /leaderboard route registered in _layout.tsx. Hub screen has
            // three cards — daily, trophies, community — matching web.
            onPress={() => router.push('/leaderboard' as never)}
          />
        </View>

        <SubscribeHomeBanner />

        <YourUpcomingGamesStrip />

        <BrowseGamesList previewLimit={5} onSeeAll={() => router.push('/browse' as never)} />

        {recent.length === 0 ? (
          <View style={styles.recentBlock}>
            <Text style={styles.sectionTitle}>Recent</Text>
            {/*
              Empty-state hint for a fresh device / first-time user. Once the
              user joins or creates a single game, the recent list replaces
              this and the hint never renders again.
            */}
            <SurfaceCard>
              <Text style={styles.emptyRecentTitle}>Nothing here yet</Text>
              <Text style={styles.emptyRecentBody}>
                Games you join or create show up here so you can jump back in with one tap.
              </Text>
            </SurfaceCard>
          </View>
        ) : null}

        {recent.length > 0 ? (
          <View style={styles.recentBlock}>
            <Text style={styles.sectionTitle}>Recent</Text>
            <SurfaceCard padding={0} gap={0}>
              {visibleRecent.map((entry, i) => (
                <ListRow
                  key={entry.code}
                  onPress={() => router.push(`/game/${entry.code}`)}
                  divider={i < visibleRecent.length - 1}
                  left={
                    <View style={styles.recentBadge}>
                      <Text style={styles.recentBadgeText}>{entry.code.slice(0, 2)}</Text>
                    </View>
                  }
                  title={<Text style={styles.recentCode}>{entry.code}</Text>}
                  subtitle={entry.gameType ? gameLabel(entry.gameType as never) : entry.title || 'Game'}
                  right={<Text style={styles.recentChevron}>›</Text>}
                />
              ))}
            </SurfaceCard>
            {hiddenRecentCount > 0 ? (
              <AppButton
                label={showAllRecent ? 'Show less' : `Show all ${recent.length}`}
                tone="ghost"
                onPress={() => setShowAllRecent((v) => !v)}
              />
            ) : null}
          </View>
        ) : null}
      </KeyboardFormScreen>
    </SafeAreaView>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    container: {
      paddingHorizontal: theme.space.lg,
      paddingTop: theme.space.md,
      paddingBottom: 40,
      gap: theme.space.lg,
      // Center + cap on iPad so the home screen isn't a stretched phone layout.
      ...centeredContent,
    },
    hero: {
      alignItems: 'center',
      paddingTop: theme.space.sm,
      paddingBottom: theme.space.xs,
      gap: theme.space.xs,
    },
    kicker: {
      color: theme.primaryMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    tagline: {
      color: theme.textMuted,
      fontSize: theme.type.body.size,
      lineHeight: theme.type.body.lineHeight + 3,
      textAlign: 'center',
      maxWidth: 280,
      marginTop: 4,
    },
    cardLabel: {
      color: theme.primaryMuted,
      fontSize: theme.type.caption.size,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    codeInput: {
      backgroundColor: theme.bg,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      color: theme.text,
      fontSize: 28,
      fontWeight: '800',
      letterSpacing: 6,
      textAlign: 'center',
      paddingVertical: 18,
      paddingHorizontal: theme.space.md,
    },
    actions: {
      gap: theme.space.xs,
      alignItems: 'stretch',
    },
    recentBlock: { gap: theme.space.sm },
    sectionTitle: {
      color: theme.text,
      fontSize: theme.type.title.size,
      lineHeight: theme.type.title.lineHeight,
      fontWeight: theme.type.title.weight,
      letterSpacing: theme.type.title.letterSpacing,
      marginBottom: 2,
    },
    // Recent-row primitives — the row itself is now a ListRow; these style the
    // slots (badge + code + chevron) that ListRow accepts as `left` / `title` /
    // `right` nodes.
    recentBadge: {
      width: 44,
      height: 44,
      borderRadius: theme.radius.md,
      backgroundColor: theme.primarySoft,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recentBadgeText: {
      color: theme.primaryMuted,
      fontSize: theme.type.label.size,
      fontWeight: '800',
    },
    recentCode: {
      color: theme.text,
      fontSize: theme.type.section.size,
      fontWeight: '800',
      letterSpacing: 2,
    },
    recentChevron: { color: theme.textFaint, fontSize: 24, fontWeight: '300' },
    emptyRecentTitle: { color: theme.text, fontSize: theme.type.section.size, fontWeight: '700' },
    emptyRecentBody: { color: theme.textMuted, fontSize: theme.type.body.size, lineHeight: 21 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  })
