import { useCallback, useState } from 'react'
import { Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { normalizeGameCode } from '@fateround/shared'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { AppButton } from '@/components/ui/AppButton'
import { KeyboardFormScreen } from '@/components/ui/KeyboardFormScreen'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { ThemeModeButton } from '@/components/ui/ThemeModeToggle'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { WEB_BASE_URL } from '@/lib/config'
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
          <ThemeModeButton />
        </View>

        <View style={styles.hero}>
          <Text style={styles.kicker}>Party games</Text>
          <FateRoundLogo variant="stacked" width={200} />
          <Text style={styles.tagline}>Join friends with a code. No account, no fuss.</Text>
        </View>

        <SurfaceCard accent>
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
          <AppButton label="Join game" onPress={onJoin} disabled={!canJoin} />
        </SurfaceCard>

        <View style={styles.actions}>
          <AppButton
            label="Create a game"
            variant="secondary"
            onPress={() => router.push('/create')}
            style={styles.flexBtn}
          />
          <AppButton
            label="Advanced setup on web"
            variant="ghost"
            onPress={() => void Linking.openURL(`${WEB_BASE_URL}/create`)}
          />
        </View>

        {recent.length > 0 ? (
          <View style={styles.recentBlock}>
            <Text style={styles.sectionTitle}>Recent</Text>
            {visibleRecent.map((entry) => (
              <Pressable
                key={entry.code}
                style={({ pressed }) => [styles.recentRow, pressed && styles.recentRowPressed]}
                onPress={() => router.push(`/game/${entry.code}`)}
              >
                <View style={styles.recentBadge}>
                  <Text style={styles.recentBadgeText}>{entry.code.slice(0, 2)}</Text>
                </View>
                <View style={styles.recentMeta}>
                  <Text style={styles.recentCode}>{entry.code}</Text>
                  <Text style={styles.recentLabel} numberOfLines={1}>
                    {entry.gameType ? gameLabel(entry.gameType as never) : entry.title || 'Game'}
                  </Text>
                </View>
                <Text style={styles.recentChevron}>›</Text>
              </Pressable>
            ))}
            {hiddenRecentCount > 0 ? (
              <Pressable
                style={({ pressed }) => [styles.recentToggle, pressed && styles.recentRowPressed]}
                onPress={() => setShowAllRecent((v) => !v)}
                hitSlop={8}
              >
                <Text style={styles.recentToggleText}>
                  {showAllRecent ? 'Show less' : `Show all ${recent.length}`}
                </Text>
              </Pressable>
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
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 280,
    marginTop: 4,
  },
  cardLabel: {
    color: theme.primaryMuted,
    fontSize: 12,
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
  flexBtn: { width: '100%' },
  recentBlock: { gap: theme.space.sm },
  sectionTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.space.md,
    gap: theme.space.md,
  },
  recentRowPressed: { opacity: 0.85 },
  recentBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: theme.borderAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentBadgeText: {
    color: theme.primaryMuted,
    fontSize: 14,
    fontWeight: '800',
  },
  recentToggle: {
    alignItems: 'center',
    paddingVertical: theme.space.sm,
    marginTop: 2,
  },
  recentToggleText: {
    color: theme.primaryMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  recentMeta: { flex: 1, gap: 2 },
  recentCode: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 2,
  },
  recentLabel: { color: theme.textMuted, fontSize: 14 },
  recentChevron: { color: theme.textFaint, fontSize: 24, fontWeight: '300' },
  topBar: { alignItems: 'flex-start' },
})
