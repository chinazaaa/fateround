/**
 * Daily Challenge leaderboard (mobile).
 *
 * Native port of `src/components/daily/DailyLeaderboardClient.tsx`.
 * Reads the same /api/daily-challenges/[gameType]/leaderboard endpoint,
 * so mobile and web leaderboards are always the same numbers.
 *
 * Two tabs — "Today" (with prev/next day nav) and "Best" (all-time). Top
 * three get a soft podium tint, matching web. When the player's rank
 * sits outside the top page, a sticky footer at the bottom pins their
 * own row so they can always see how they compare.
 */

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { apiUrl } from '@/lib/config'
import { authHeaders } from '@/lib/identity'
import {
  DAILY_CHALLENGE_GAME_TYPES,
  DAILY_GAME_EMOJIS,
  DAILY_GAME_LABELS,
  DAILY_GAME_PRIMARY_METRIC,
  DAILY_GAME_SLUG_TO_TYPE,
  DAILY_GAME_TYPE_TO_SLUG,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import { addDays, formatDayLabel, watToday } from '@/lib/community-dates'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { centeredContent } from '@/constants/layout'

type Tab = 'today' | 'alltime'

interface LeaderboardEntry {
  rank: number
  profileId: string
  handle: string
  username: string | null
  avatarUrl: string | null
  normalizedScore?: number
  rawPoints?: number
  itemsSolved?: number
  timeSeconds?: number
  bestScore?: number
  bestTime?: number
  totalPlays?: number
}

const PODIUM_BG = ['rgba(255,215,0,0.14)', 'rgba(192,192,192,0.14)', 'rgba(205,127,50,0.14)']
const PODIUM_BORDER = ['rgba(255,215,0,0.32)', 'rgba(192,192,192,0.32)', 'rgba(205,127,50,0.32)']
const MEDAL = ['🥇', '🥈', '🥉']

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function DailyLeaderboard() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const router = useRouter()
  const params = useLocalSearchParams<{ slug: string }>()
  const slug = typeof params.slug === 'string' ? params.slug : ''
  const gameType = DAILY_GAME_SLUG_TO_TYPE[slug] as DailyChallengeGameType | undefined

  const today = watToday()
  const [tab, setTab] = useState<Tab>('today')
  const [date, setDate] = useState(today)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [total, setTotal] = useState(0)
  const [myRank, setMyRank] = useState<number | null>(null)
  const [myScore, setMyScore] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!gameType) return
      setLoading(true)
      try {
        const headers = await authHeaders()
        const query = new URLSearchParams({ tab, date }).toString()
        const res = await fetch(
          apiUrl(`/api/daily-challenges/${gameType}/leaderboard?${query}`),
          { headers: headers ?? undefined, signal }
        )
        if (!res.ok || signal.aborted) return
        const data = (await res.json()) as {
          entries?: LeaderboardEntry[]
          total?: number
          myRank?: number | null
          myScore?: number | null
        }
        if (signal.aborted) return
        setEntries(data.entries ?? [])
        setTotal(data.total ?? 0)
        setMyRank(data.myRank ?? null)
        setMyScore(data.myScore ?? null)
      } catch {
        if (!signal.aborted) setEntries([])
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [gameType, tab, date]
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (!gameType) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: 'Not found' }} />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Game not found.</Text>
          <AppButton
            label="Back to Daily Challenges"
            tone="secondary"
            onPress={() => router.replace('/daily-challenges' as never)}
          />
        </View>
      </SafeAreaView>
    )
  }

  const step = (dir: -1 | 1) => setDate((d) => addDays(d, dir))
  const isToday = date === today
  const metric = DAILY_GAME_PRIMARY_METRIC[gameType]

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Leaderboard' }} />
      <AmbientBackground />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.emoji}>{DAILY_GAME_EMOJIS[gameType]}</Text>
          <Text style={styles.title}>{DAILY_GAME_LABELS[gameType]} Leaderboard</Text>
        </View>

        {/* Game chips — swap to a different game's leaderboard. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {DAILY_CHALLENGE_GAME_TYPES.map((gt) => {
            const active = gt === gameType
            return (
              <Pressable
                key={gt}
                onPress={() => {
                  if (active) return
                  router.replace(`/daily-challenges/leaderboard/${DAILY_GAME_TYPE_TO_SLUG[gt]}` as never)
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? theme.primary : theme.surface,
                    borderColor: active ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? '#fff' : theme.text }]}>
                  {DAILY_GAME_EMOJIS[gt]} {DAILY_GAME_LABELS[gt]}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {/* Today / Best tabs */}
        <View style={[styles.tabs, { backgroundColor: theme.surface }]}>
          {(['today', 'alltime'] as const).map((t) => {
            const active = tab === t
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[
                  styles.tab,
                  active && { backgroundColor: theme.primary },
                ]}
              >
                <Text style={[styles.tabText, { color: active ? '#fff' : theme.textMuted }]}>
                  {t === 'today' ? 'Today' : 'Best'}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Date stepper — today tab only. */}
        {tab === 'today' ? (
          <View style={styles.dateRow}>
            <AppButton label="←" tone="ghost" size="sm" onPress={() => step(-1)} />
            <Text style={styles.dateLabel}>{isToday ? 'Today' : formatDayLabel(date)}</Text>
            <AppButton label="→" tone="ghost" size="sm" onPress={() => step(1)} disabled={isToday} />
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={theme.primaryMuted} style={{ marginTop: 30 }} />
        ) : entries.length === 0 ? (
          <SurfaceCard padding={20}>
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyTitle}>
                {tab === 'today' && !isToday ? 'No scores for this day' : 'No scores yet'}
              </Text>
              <Text style={styles.emptyBody}>Be the first to make it on the board.</Text>
              {tab === 'today' && isToday ? (
                <AppButton
                  label="Play now"
                  size="sm"
                  onPress={() =>
                    router.push(`/daily-challenges/${DAILY_GAME_TYPE_TO_SLUG[gameType]}` as never)
                  }
                />
              ) : null}
            </View>
          </SurfaceCard>
        ) : (
          <View style={styles.entries}>
            {entries.map((entry) => {
              const score =
                metric === 'score'
                  ? entry.rawPoints ?? entry.bestScore ?? 0
                  : entry.normalizedScore ?? entry.bestScore ?? 0
              const time = entry.timeSeconds ?? entry.bestTime ?? 0
              const isTop3 = entry.rank <= 3
              return (
                <View
                  key={entry.profileId}
                  style={[
                    styles.entryRow,
                    isTop3
                      ? { backgroundColor: PODIUM_BG[entry.rank - 1], borderColor: PODIUM_BORDER[entry.rank - 1] }
                      : { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                >
                  <View style={styles.rankCol}>
                    {isTop3 ? (
                      <Text style={styles.medal}>{MEDAL[entry.rank - 1]}</Text>
                    ) : (
                      <Text style={[styles.rankText, { color: theme.textFaint }]}>#{entry.rank}</Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.avatar,
                      {
                        backgroundColor: entry.rank === 1 ? theme.primary : theme.bg,
                        borderColor: entry.rank === 1 ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.avatarText,
                        { color: entry.rank === 1 ? '#fff' : theme.textMuted },
                      ]}
                    >
                      {(entry.handle || 'G').slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.handle,
                        { color: entry.rank === 1 ? theme.primary : theme.text },
                      ]}
                    >
                      {entry.handle || 'Guest'}
                    </Text>
                    {entry.username ? (
                      <Text numberOfLines={1} style={styles.username}>
                        @{entry.username}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.scoreCol}>
                    <Text
                      style={[
                        styles.scorePrimary,
                        { color: entry.rank === 1 ? theme.primary : theme.text },
                      ]}
                    >
                      {metric === 'time' ? formatTime(time) : score}
                    </Text>
                    <Text style={styles.scoreSecondary}>
                      {metric === 'time' ? `${score} pts` : formatTime(time)}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        )}

        {!loading && total > entries.length ? (
          <Text style={styles.totalNote}>
            Showing top {entries.length} of {total} players
          </Text>
        ) : null}
      </ScrollView>

      {/* Sticky "your rank" footer — mirrors web behavior: shows only when the player
          scored and their rank sits outside the returned page. */}
      {myRank && myScore !== null && myScore > 0 && myRank > entries.length ? (
        <View style={[styles.stickyFooter, { backgroundColor: theme.surface, borderColor: theme.borderAccent }]}>
          <View>
            <Text style={styles.stickyTitle}>Your rank</Text>
            <Text style={styles.stickyBody}>
              #{myRank} of {total}
            </Text>
          </View>
          <Text style={[styles.stickyScore, { color: theme.primary }]}>{myScore}</Text>
        </View>
      ) : null}
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
    hero: { alignItems: 'center', gap: 6 },
    emoji: { fontSize: 32 },
    title: { color: theme.text, fontSize: theme.type.title.size, fontWeight: '800', textAlign: 'center' },
    chipsRow: { gap: 6, paddingVertical: 2 },
    chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
    chipText: { fontSize: 12, fontWeight: '700' },
    tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12 },
    tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
    tabText: { fontSize: theme.type.body.size, fontWeight: '700' },
    dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dateLabel: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '600' },
    emptyState: { alignItems: 'center', gap: 8 },
    emptyEmoji: { fontSize: 34 },
    emptyTitle: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700' },
    emptyBody: { color: theme.textMuted, fontSize: theme.type.caption.size },
    entries: { gap: 6 },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    rankCol: { width: 32, alignItems: 'center' },
    medal: { fontSize: 22 },
    rankText: { fontSize: 12, fontWeight: '700' },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    avatarText: { fontSize: 12, fontWeight: '800' },
    handle: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700' },
    username: { color: theme.textFaint, fontSize: 11, marginTop: 1 },
    scoreCol: { alignItems: 'flex-end' },
    scorePrimary: { fontSize: theme.type.body.size, fontWeight: '800', fontVariant: ['tabular-nums'] },
    scoreSecondary: { color: theme.textFaint, fontSize: 10, fontVariant: ['tabular-nums'], marginTop: 2 },
    totalNote: { color: theme.textFaint, fontSize: theme.type.caption.size, textAlign: 'center' },
    stickyFooter: {
      position: 'absolute',
      left: theme.space.md,
      right: theme.space.md,
      bottom: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
    },
    stickyTitle: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '800' },
    stickyBody: { color: theme.textMuted, fontSize: theme.type.caption.size },
    stickyScore: { fontSize: theme.type.title.size, fontWeight: '900', fontVariant: ['tabular-nums'] },
    notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
    notFoundText: { color: theme.text, fontSize: theme.type.body.size },
  })
