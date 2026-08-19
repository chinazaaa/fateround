/**
 * Community Leaderboard — mobile screen.
 *
 * Mobile parallel of `src/app/leaderboard/community/page.tsx`. Reads the same
 * public `/api/leaderboard` endpoint (no auth) that web reads and renders the
 * same Today / Week / Month windows against the same game filter.
 *
 * Layout:
 *   [Header: title + tagline]
 *   [SegmentedControl: Today · Week · Month]
 *   [Game chip strip: All games · Whot · Ludo · ...]
 *   [Date navigator: ◀  "Winners for Tue, 30 June"  ▶]
 *   [Content]
 *     · Today: SurfaceCard per game with winners list
 *     · Week/Month: champion hero card + ranked ListRow standings
 *
 * Built entirely on Phase 0 primitives (SurfaceCard + AppButton + ListRow +
 * SegmentedControl). No new native modules — plain fetch + AsyncStorage-free.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { ListRow } from '@/components/ui/ListRow'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { addDays, addMonths, watToday } from '@/lib/community-dates'
import { apiUrl } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

// Mirrors the web /api/leaderboard response shape (see src/types/community.ts).
// Duplicated here instead of importing across app boundaries so mobile stays
// self-contained; the endpoint is public and stable.
type LeaderboardWindow = 'today' | 'week' | 'month'

type LeaderboardGameOption = {
  id: string
  name: string
  slug: string
  accent: string | null
}

type DailyGameWinner = {
  game: LeaderboardGameOption
  winners: { name: string; wins: number }[]
}

type LeaderboardStanding = {
  rank: number
  playerName: string
  wins: number
  gamesWon: number
}

type LeaderboardResponse = {
  window: LeaderboardWindow
  label: string
  rangeStart: string
  rangeEnd: string
  today: DailyGameWinner[]
  standings: LeaderboardStanding[]
  whatsappInviteUrl: string | null
  game: string | null
  games: LeaderboardGameOption[]
}

const ALL_GAMES = ''

const WINDOW_OPTIONS: { value: LeaderboardWindow; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
]

// Podium ranks 1–3 borrow the web tints so the medal colours are the same on
// both platforms.
const PODIUM_TINTS = ['#d4a017', '#8e9099', '#a4682d']

export default function CommunityLeaderboardScreen() {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)

  const today = useMemo(() => watToday(), [])
  const [tab, setTab] = useState<LeaderboardWindow>('today')
  const [selectedDate, setSelectedDate] = useState<string>(today)
  const [game, setGame] = useState<string>(ALL_GAMES)
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [refreshing, setRefreshing] = useState(false)
  // Holds the latest in-flight request so a newer selection / refresh aborts the
  // previous one — otherwise a slow request could resolve after a newer one and
  // show data for the wrong selection.
  const loadControllerRef = useRef<AbortController | null>(null)

  const load = useCallback(
    async (
      win: LeaderboardWindow,
      date: string,
      gameSlug: string,
      signal: AbortSignal,
      opts?: { isRefresh?: boolean }
    ) => {
      // A pull-to-refresh keeps the current leaderboard visible (its own spinner
      // covers the wait); only an initial/selection load shows the full loader.
      if (!opts?.isRefresh) setLoading(true)
      setError(null)
      try {
        const query = new URLSearchParams({ window: win, date })
        if (gameSlug) query.set('game', gameSlug)
        const res = await fetch(apiUrl(`/api/leaderboard?${query.toString()}`), {
          cache: 'no-store',
          signal,
        })
        const json = await res.json()
        if (!res.ok) throw new Error((json && json.error) || 'Failed to load')
        if (signal.aborted) return
        setData(json as LeaderboardResponse)
      } catch (err) {
        if (signal.aborted) return
        setError(err instanceof Error ? err.message : 'Failed to load')
        // Only blank the content on an initial/selection load. A failed refresh
        // must keep the last good leaderboard rather than replacing it with an
        // empty error state.
        if (!opts?.isRefresh) setData(null)
      } finally {
        if (!signal.aborted && !opts?.isRefresh) setLoading(false)
      }
    },
    []
  )

  // Start a request, aborting whatever was in flight, and hand back the controller
  // so callers can track which request is theirs.
  const startLoad = useCallback(
    (win: LeaderboardWindow, date: string, gameSlug: string, opts?: { isRefresh?: boolean }) => {
      loadControllerRef.current?.abort()
      const controller = new AbortController()
      loadControllerRef.current = controller
      return { controller, promise: load(win, date, gameSlug, controller.signal, opts) }
    },
    [load]
  )

  useEffect(() => {
    startLoad(tab, selectedDate, game)
    return () => loadControllerRef.current?.abort()
  }, [tab, selectedDate, game, startLoad])

  // Reset the selected date whenever the window changes so the user always
  // lands on the current period rather than a stale offset from the last tab.
  const onTabChange = (next: LeaderboardWindow) => {
    setTab(next)
    setSelectedDate(today)
  }

  const games = data?.games ?? []
  const gameName = games.find((g) => g.slug === game)?.name ?? null

  const step = (dir: -1 | 1) => {
    setSelectedDate((d) =>
      tab === 'today' ? addDays(d, dir) : tab === 'week' ? addDays(d, dir * 7) : addMonths(d, dir)
    )
  }

  const canGoNext = !!data && data.rangeEnd < today

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    const { controller, promise } = startLoad(tab, selectedDate, game, { isRefresh: true })
    try {
      await promise
    } finally {
      // Only the request that's still current clears the spinner — a stale
      // refresh that was aborted by a newer selection must not touch it.
      if (loadControllerRef.current === controller) setRefreshing(false)
    }
  }, [game, startLoad, selectedDate, tab])

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Community' }} />
      <AmbientBackground />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
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
          <Text style={styles.kicker}>🏆 Community</Text>
          <Text style={styles.heroTitle}>Community Leaderboard</Text>
          <Text style={styles.heroBlurb}>Nightly champions from the community games.</Text>
        </View>

        <SegmentedControl<LeaderboardWindow> value={tab} onChange={onTabChange} options={WINDOW_OPTIONS} />

        {games.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <GameChip
              label="All games"
              accent={theme.primary}
              selected={game === ALL_GAMES}
              onPress={() => setGame(ALL_GAMES)}
            />
            {games.map((g) => (
              <GameChip
                key={g.id}
                label={g.name}
                accent={g.accent ?? theme.primary}
                selected={game === g.slug}
                onPress={() => setGame(g.slug)}
              />
            ))}
          </ScrollView>
        ) : null}

        {data ? (
          <View style={styles.nav}>
            <NavButton onPress={() => step(-1)} label="‹" />
            <View style={styles.navLabel}>
              <Text style={styles.navKicker}>
                {tab === 'today' ? 'Winners for' : tab === 'week' ? 'Week of' : 'Month of'}
              </Text>
              <Text style={styles.navValue} numberOfLines={1}>
                {data.label}
              </Text>
            </View>
            <NavButton onPress={() => step(1)} label="›" disabled={!canGoNext} />
          </View>
        ) : null}

        {loading && !data ? (
          <SurfaceCard style={styles.center}>
            <Text style={styles.muted}>Loading…</Text>
          </SurfaceCard>
        ) : error ? (
          <SurfaceCard style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
          </SurfaceCard>
        ) : data && tab === 'today' ? (
          <TodayList data={data} />
        ) : data ? (
          <StandingsList data={data} gameName={gameName} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function GameChip({
  label,
  accent,
  selected,
  onPress,
}: {
  label: string
  accent: string
  selected: boolean
  onPress: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && { backgroundColor: accent, borderColor: accent }]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function NavButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.navBtn, disabled && styles.navBtnDisabled]}
      accessibilityRole="button"
      accessibilityLabel={label === '‹' ? 'Previous period' : 'Next period'}
    >
      <Text style={styles.navBtnText}>{label}</Text>
    </Pressable>
  )
}

function TodayList({ data }: { data: LeaderboardResponse }) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)

  if (data.today.length === 0) {
    return (
      <SurfaceCard style={styles.center}>
        <Text style={styles.muted}>No games are set up yet. Check back soon.</Text>
      </SurfaceCard>
    )
  }

  // Games with winners come first; empty games slide to the bottom.
  const ordered = [...data.today].sort((a, b) => (b.winners.length ? 1 : 0) - (a.winners.length ? 1 : 0))

  return (
    <View style={styles.todayList}>
      {ordered.map((entry) => {
        const accent = entry.game.accent ?? theme.primary
        const hasWinners = entry.winners.length > 0
        return (
          <SurfaceCard key={entry.game.id}>
            <View style={styles.todayHeader}>
              <View style={[styles.gameDot, { backgroundColor: accent }]} />
              <Text style={styles.gameName}>{entry.game.name}</Text>
            </View>
            {hasWinners ? (
              <>
                <Text style={styles.winnersKicker}>
                  {entry.winners.length === 1 ? 'Winner' : `Winners · ${entry.winners.length}`}
                </Text>
                <View style={styles.winnersRow}>
                  {entry.winners.map((w, i) => (
                    <Text key={`${w.name}-${i}`} style={styles.winnerName}>
                      🏆 {w.name}
                      {w.wins > 1 ? <Text style={[styles.winnerMult, { color: accent }]}> ×{w.wins}</Text> : null}
                      {i < entry.winners.length - 1 ? <Text style={styles.winnerSep}>,</Text> : null}
                    </Text>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.muted}>No winner announced yet</Text>
            )}
          </SurfaceCard>
        )
      })}
    </View>
  )
}

function StandingsList({ data, gameName }: { data: LeaderboardResponse; gameName: string | null }) {
  const styles = useThemedStyles(makeStyles)

  if (data.standings.length === 0) {
    return (
      <SurfaceCard style={styles.center}>
        <Text style={styles.muted}>
          No {gameName ? `${gameName} ` : ''}wins recorded for this {data.window} yet.
        </Text>
      </SurfaceCard>
    )
  }

  const champions = data.standings.filter((s) => s.rank === 1)
  const rest = data.standings.filter((s) => s.rank !== 1)
  const joint = champions.length > 1
  const topWins = champions[0]!.wins

  return (
    <View style={styles.standings}>
      <SurfaceCard style={styles.championCard}>
        <Text style={styles.championKicker}>
          {joint ? 'Joint champions' : 'Champion'} of the {data.window}
          {gameName ? ` · ${gameName}` : ''}
        </Text>
        <Text style={styles.championIcon}>🏆</Text>
        <Text style={styles.championName}>{champions.map((c) => c.playerName).join(' & ')}</Text>
        <Text style={styles.championSub}>
          {topWins} {topWins === 1 ? 'win' : 'wins'}
          {joint ? ' each' : champions[0]!.gamesWon > 1 ? ` · across ${champions[0]!.gamesWon} games` : ''}
        </Text>
      </SurfaceCard>

      {rest.length > 0 ? (
        <SurfaceCard padding={0} gap={0}>
          {rest.map((s, i) => {
            const podium = s.rank <= 3 ? PODIUM_TINTS[s.rank - 1] : null
            return (
              <ListRow
                key={`${s.rank}-${s.playerName}`}
                divider={i < rest.length - 1}
                left={
                  <View style={[styles.rankBadge, podium ? { borderColor: podium } : null]}>
                    <Text style={[styles.rankBadgeText, podium ? { color: podium } : null]}>{s.rank}</Text>
                  </View>
                }
                title={s.playerName}
                right={
                  <Text style={styles.winsText}>
                    {s.wins} {s.wins === 1 ? 'win' : 'wins'}
                  </Text>
                }
              />
            )
          })}
        </SurfaceCard>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    scroll: {
      padding: theme.space.md,
      gap: theme.space.md,
      paddingBottom: theme.space.xl,
    },
    hero: { alignItems: 'center', gap: 4, paddingTop: theme.space.xs, paddingBottom: theme.space.sm },
    kicker: {
      color: theme.primaryMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    heroTitle: {
      color: theme.text,
      fontSize: theme.type.title.size,
      fontWeight: '800',
      textAlign: 'center',
    },
    heroBlurb: {
      color: theme.textMuted,
      fontSize: theme.type.body.size,
      textAlign: 'center',
      maxWidth: 320,
    },

    chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4, paddingRight: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    chipText: { color: theme.text, fontSize: theme.type.label.size, fontWeight: '700' },
    chipTextSelected: { color: '#fff' },

    nav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 4,
    },
    navBtn: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navBtnDisabled: { opacity: 0.35 },
    navBtnText: { color: theme.text, fontSize: theme.type.title.size, fontWeight: '800', lineHeight: 24 },
    navLabel: { flex: 1, alignItems: 'center' },
    navKicker: {
      color: theme.textFaint ?? theme.textMuted,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    navValue: { color: theme.text, fontSize: theme.type.section.size, fontWeight: '800' },

    center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
    muted: { color: theme.textMuted, fontSize: theme.type.body.size, textAlign: 'center' },
    errorText: { color: theme.error, fontSize: theme.type.body.size, textAlign: 'center' },

    todayList: { gap: theme.space.sm },
    todayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    gameDot: { width: 10, height: 10, borderRadius: 5 },
    gameName: { color: theme.text, fontSize: theme.type.section.size, fontWeight: '800' },
    winnersKicker: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 6,
    },
    winnersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    winnerName: { color: theme.text, fontSize: theme.type.section.size, fontWeight: '800' },
    winnerMult: { fontSize: theme.type.caption.size, fontWeight: '800' },
    winnerSep: { color: theme.textMuted, fontWeight: '400' },

    standings: { gap: theme.space.md },
    championCard: { alignItems: 'center', paddingVertical: theme.space.lg },
    championKicker: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.4,
      textAlign: 'center',
    },
    championIcon: { fontSize: 36, marginTop: 6 },
    championName: {
      color: theme.text,
      fontSize: 28,
      fontWeight: '900',
      textAlign: 'center',
      marginTop: 4,
    },
    championSub: { color: theme.textMuted, fontSize: theme.type.body.size, textAlign: 'center', marginTop: 4 },
    rankBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankBadgeText: { color: theme.textMuted, fontSize: theme.type.label.size, fontWeight: '800' },
    winsText: { color: theme.textMuted, fontSize: theme.type.label.size, fontWeight: '700' },
  })
