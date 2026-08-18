/**
 * Daily Challenges hub (mobile).
 *
 * Mirror of the web `/daily-challenges` page (src/app/daily-challenges/page.tsx
 * → DailyHubClient). Lists today's puzzles with per-game status (played /
 * in progress / expired) using the same /api/daily-challenges/status endpoint
 * the web uses, so the hub, the leaderboard, and the play-count are all one
 * source of truth across platforms. Every daily game has a native mobile play
 * surface (see the play route in [slug].tsx); tapping a tile routes there.
 */

import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { Stack, useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { AppButton } from '@/components/ui/AppButton'
import { ListRow } from '@/components/ui/ListRow'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { apiUrl } from '@/lib/config'
import { authHeaders } from '@/lib/identity'
import {
  DAILY_CHALLENGE_GAME_TYPES,
  DAILY_CHALLENGE_LAUNCH,
  DAILY_GAME_EMOJIS,
  DAILY_GAME_LABELS,
  DAILY_GAME_PRIMARY_METRIC,
  DAILY_GAME_TIMER,
  DAILY_GAME_TYPE_TO_SLUG,
  isDailyChallengeLive,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import { formatDayLabel, watToday } from '@/lib/community-dates'
import { getStartedAtCached, preloadDailyProgress } from '@/lib/daily-progress'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { centeredContent } from '@/constants/layout'

interface GameStatus {
  gameType: DailyChallengeGameType
  available: boolean
  played: boolean
  score: number | null
  rank: number | null
  challengeId: string | null
}

interface StatusResponse {
  date: string
  challengeNumber: number
  games: GameStatus[]
  totalPlayers: number | null
}

export default function DailyChallengesHub() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const router = useRouter()

  const [games, setGames] = useState<GameStatus[]>([])
  const [challengeNumber, setChallengeNumber] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // Trigger a re-render after the async progress preload resolves so the
  // "Continue" / "See result" pills reflect real state on the first paint.
  const [progressLoaded, setProgressLoaded] = useState(0)

  const load = useCallback(async () => {
    try {
      const headers = await authHeaders()
      const res = await fetch(apiUrl('/api/daily-challenges/status'), {
        headers: headers ?? undefined,
      })
      if (!res.ok) return
      const data = (await res.json()) as StatusResponse
      setGames(data.games ?? [])
      setChallengeNumber(data.challengeNumber ?? 0)
      // Warm the progress cache so the sync `getStartedAtCached` reads below
      // can render the correct pill immediately after this state update.
      const ids = (data.games ?? []).map((g) => g.challengeId).filter((v): v is string => !!v)
      await preloadDailyProgress(ids)
      setProgressLoaded((n) => n + 1)
    } catch {
      // Silent fail — hub renders with whatever it had.
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  // Tick every 5s so the "Continue" pill flips to "See result" the moment a
  // timer runs out, matching the web hub's useExpiryRefresh behavior. 5s is
  // enough granularity for a per-minute-scale countdown and cheap.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }, [load])

  const openGame = useCallback(
    (gameType: DailyChallengeGameType) => {
      router.push(`/daily-challenges/${DAILY_GAME_TYPE_TO_SLUG[gameType]}` as never)
    },
    [router]
  )

  const today = watToday()
  const live = isDailyChallengeLive(today)
  const completedCount = games.filter((g) => g.played).length
  // Read once — silences the "assigned but never used" lint on the trigger.
  void progressLoaded

  if (!live) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: 'Daily Challenges' }} />
        <AmbientBackground />
        <View style={styles.notLiveWrap}>
          <Text style={styles.notLiveEmoji}>🗓️</Text>
          <Text style={styles.notLiveTitle}>Daily Challenge starts {formatDayLabel(DAILY_CHALLENGE_LAUNCH)}</Text>
          <Text style={styles.notLiveBody}>
            Five puzzles a day, same for everyone, one shot each. Come back on launch day!
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Daily Challenges' }} />
      <AmbientBackground />
      <ScrollView
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
        <View style={styles.hero}>
          <Text style={styles.kicker}>Puzzle of the day</Text>
          <Text style={styles.title}>Daily Challenge</Text>
          <Text style={styles.blurb}>Same puzzle for everyone. One shot, one score.</Text>
          {challengeNumber > 0 ? <Text style={styles.dayLabel}>Day #{challengeNumber}</Text> : null}
        </View>

        {!loading && completedCount > 0 ? (
          <SurfaceCard padding={12}>
            <Text style={styles.progressText}>
              {completedCount}/{DAILY_CHALLENGE_GAME_TYPES.length} completed today
            </Text>
            <View style={styles.dots}>
              {DAILY_CHALLENGE_GAME_TYPES.map((gt) => {
                const played = games.find((g) => g.gameType === gt)?.played
                return (
                  <View
                    key={gt}
                    style={[styles.dot, { backgroundColor: played ? theme.primary : theme.surface }]}
                  />
                )
              })}
            </View>
          </SurfaceCard>
        ) : null}

        <SurfaceCard padding={0} gap={0}>
          {DAILY_CHALLENGE_GAME_TYPES.map((gameType, i) => {
            const status = games.find((g) => g.gameType === gameType)
            const played = status?.played ?? false
            const score = status?.score ?? null
            const rank = status?.rank ?? null
            const challengeId = status?.challengeId ?? null
            const startedAt = challengeId ? getStartedAtCached(challengeId) : null
            const inProgress =
              startedAt != null && now < startedAt + DAILY_GAME_TIMER[gameType] * 1000
            const expired = startedAt != null && !inProgress
            const metric = DAILY_GAME_PRIMARY_METRIC[gameType]

            return (
              <ListRow
                key={gameType}
                onPress={() => openGame(gameType)}
                divider={i < DAILY_CHALLENGE_GAME_TYPES.length - 1}
                left={
                  <View style={styles.gameGlyph}>
                    <Text style={styles.gameGlyphText}>{DAILY_GAME_EMOJIS[gameType]}</Text>
                  </View>
                }
                title={<Text style={styles.gameTitle}>{DAILY_GAME_LABELS[gameType]}</Text>}
                subtitle={
                  loading
                    ? 'Loading…'
                    : played
                      ? metric === 'score'
                        ? `${score ?? 0} pts${rank ? ` · #${rank}` : ' · Completed'}`
                        : `${score ?? 0}/1000${rank ? ` · #${rank}` : ' · Completed'}`
                      : inProgress
                        ? 'Continue where you left off'
                        : expired
                          ? 'Time expired — see result'
                          : metric === 'time'
                            ? 'Fastest time wins'
                            : 'Highest score wins'
                }
                right={
                  <Text style={[styles.chevron, { color: theme.textFaint }]}>
                    {played ? '›' : inProgress ? '▶' : '›'}
                  </Text>
                }
              />
            )
          })}
        </SurfaceCard>

        <AppButton
          label="View leaderboards"
          tone="ghost"
          onPress={() => router.push('/daily-challenges/leaderboard/sudoku' as never)}
        />

        {loading ? <ActivityIndicator color={theme.primaryMuted} style={styles.spinner} /> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    container: {
      paddingHorizontal: theme.space.md,
      paddingTop: theme.space.md,
      paddingBottom: 40,
      gap: theme.space.md,
      ...centeredContent,
    },
    hero: { alignItems: 'center', gap: 4, paddingTop: theme.space.sm },
    kicker: {
      color: theme.primaryMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    title: { color: theme.text, fontSize: theme.type.display.size, fontWeight: '800' },
    blurb: { color: theme.textMuted, fontSize: theme.type.body.size, textAlign: 'center' },
    dayLabel: {
      color: theme.textFaint,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 2,
      textTransform: 'uppercase',
      marginTop: 6,
    },
    progressText: { color: theme.textMuted, fontSize: theme.type.body.size, textAlign: 'center' },
    dots: { flexDirection: 'row', gap: 4, justifyContent: 'center', marginTop: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    gameGlyph: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gameGlyphText: { fontSize: 20 },
    gameTitle: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700' },
    chevron: { fontSize: 22, fontWeight: '600' },
    spinner: { marginTop: theme.space.md },
    notLiveWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.space.lg,
      gap: 12,
    },
    notLiveEmoji: { fontSize: 44 },
    notLiveTitle: {
      color: theme.text,
      fontSize: theme.type.title.size,
      fontWeight: '800',
      textAlign: 'center',
    },
    notLiveBody: { color: theme.textMuted, fontSize: theme.type.body.size, textAlign: 'center' },
  })
