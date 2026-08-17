/**
 * BrowseGamesList — public games feed for mobile.
 *
 * Mirrors src/components/browse/BrowseGamesPage.tsx: reads the same public
 * GET /api/games cursor-paginated feed, subscribes to the same Supabase
 * `games` realtime channel for freshness, and renders each row using the
 * SurfaceCard + ListRow primitives. A chip strip along the top filters by
 * game type (same pattern as community.tsx). No new native modules.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import type { GameType } from '@fateround/shared'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { apiUrl } from '@/lib/config'
import { getSupabase } from '@/lib/supabase'
import { gameLabel } from '@/lib/mobile-registry'
import { gameTypeMeta } from '@/lib/game-type-meta'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type PublicGame = {
  id: string
  title: string | null
  game_type: string
  status: 'scheduled' | 'waiting' | 'active' | 'finished'
  max_players: number | null
  allow_late_players: boolean | null
  created_at: string
  /** Discovery Phase C — only set on scheduled games. */
  scheduled_at?: string | null
  playerCount: number
}

const POLL_FALLBACK_MS = 15_000
const PAGE_LIMIT = 20

const ALL = ''

async function fetchGamesPage(
  cursor?: string | null,
  statusFilter?: 'scheduled'
): Promise<{
  games: PublicGame[]
  hasMore: boolean
  nextCursor: string | null
}> {
  const params = new URLSearchParams({ limit: String(PAGE_LIMIT) })
  if (cursor) params.set('cursor', cursor)
  if (statusFilter) params.set('status', statusFilter)
  const res = await fetch(apiUrl(`/api/games?${params.toString()}`), { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to load games')
  return res.json()
}

type Tab = 'live' | 'upcoming'

type Props = {
  /** Optional cap for embedded previews ("Live games" strip). Full list omits. */
  previewLimit?: number
  onSeeAll?: () => void
  /** Discovery Phase C — when 'upcoming', the list fetches scheduled games via
   *  ?status=scheduled and shows the countdown + RSVP button. When 'live' (or
   *  omitted), Phase A behaviour is unchanged. */
  tab?: Tab
}

export function BrowseGamesList({ previewLimit, onSeeAll, tab = 'live' }: Props) {
  const router = useRouter()
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [games, setGames] = useState<PublicGame[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<string>(ALL)
  const inFlight = useRef(false)

  const load = useCallback(
    async (nextCursor?: string | null, silent = false) => {
      const paged = !!nextCursor
      if (paged) setLoadingMore(true)
      else if (!silent) setLoading(true)
      try {
        const data = await fetchGamesPage(nextCursor, tab === 'upcoming' ? 'scheduled' : undefined)
        setGames((prev) => (paged ? [...prev, ...data.games] : data.games))
        setHasMore(data.hasMore)
        setCursor(data.nextCursor)
      } catch {
        if (!paged && !silent) {
          setGames([])
          setHasMore(false)
          setCursor(null)
        }
      } finally {
        if (paged) setLoadingMore(false)
        else if (!silent) setLoading(false)
      }
    },
    [tab]
  )

  useEffect(() => {
    void load()
  }, [load])

  // Realtime + poll fallback. Any game row change (create / status flip / finish)
  // re-fetches the first page silently — mirrors the web BrowseGamesPage pattern.
  useEffect(() => {
    if (previewLimit) return undefined // preview strip on Home refreshes on focus, not realtime
    const supabase = getSupabase()
    const channel = supabase
      .channel('public_games_browse_mobile')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => {
        if (inFlight.current) return
        inFlight.current = true
        void load(null, true).finally(() => {
          inFlight.current = false
        })
      })
      .subscribe()
    const interval = setInterval(() => {
      void load(null, true)
    }, POLL_FALLBACK_MS)
    return () => {
      void supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [load, previewLimit])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await load(null, true)
    } finally {
      setRefreshing(false)
    }
  }, [load])

  // Distinct game types in the current page — chip options track what's actually
  // in the feed, not the full game roster (so an empty type never renders a chip).
  const chipOptions = useMemo(() => {
    const seen = new Set<string>()
    const order: string[] = []
    for (const g of games) {
      if (!seen.has(g.game_type)) {
        seen.add(g.game_type)
        order.push(g.game_type)
      }
    }
    return order
  }, [games])

  const visible = useMemo(() => {
    const filtered = filter === ALL ? games : games.filter((g) => g.game_type === filter)
    return previewLimit ? filtered.slice(0, previewLimit) : filtered
  }, [games, filter, previewLimit])

  if (previewLimit) {
    // Home preview: strip only, no chrome — auto-hides when empty so a fresh
    // install doesn't show an empty box.
    if (loading || visible.length === 0) return null
    return (
      <View style={styles.previewBlock}>
        <View style={styles.previewHeader}>
          <Text style={styles.sectionTitle}>Live games</Text>
          {onSeeAll ? (
            <Pressable onPress={onSeeAll} hitSlop={8}>
              <Text style={styles.seeAll}>See all →</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.previewList}>
          {visible.map((g) => (
            <GameCard key={g.id} game={g} onJoin={() => router.push(`/game/${g.id}` as never)} />
          ))}
        </View>
      </View>
    )
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          tintColor={theme.primaryMuted}
          colors={[theme.primary]}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {chipOptions.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label="All games" selected={filter === ALL} onPress={() => setFilter(ALL)} accent={theme.primary} />
          {chipOptions.map((t) => (
            <Chip
              key={t}
              label={gameLabel(t as GameType)}
              selected={filter === t}
              onPress={() => setFilter(t)}
              accent={theme.primary}
            />
          ))}
        </ScrollView>
      ) : null}

      {loading ? (
        <SurfaceCard style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </SurfaceCard>
      ) : visible.length === 0 ? (
        <SurfaceCard style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🎲</Text>
          <Text style={styles.emptyTitle}>No public games right now</Text>
          <Text style={styles.emptyBody}>
            Nothing’s being played publicly yet. Start a game and set it to Public — it’ll show up here.
          </Text>
          <AppButton label="Create a game" onPress={() => router.push('/create')} size="md" />
        </SurfaceCard>
      ) : (
        <View style={styles.list}>
          {visible.map((g) => (
            <GameCard key={g.id} game={g} onJoin={() => router.push(`/game/${g.id}` as never)} />
          ))}
        </View>
      )}

      {hasMore && !loading && filter === ALL ? (
        <AppButton
          label={loadingMore ? 'Loading…' : 'Load more'}
          tone="secondary"
          onPress={() => void load(cursor)}
          disabled={loadingMore}
        />
      ) : null}
    </ScrollView>
  )
}

function Chip({
  label,
  selected,
  onPress,
  accent,
}: {
  label: string
  selected: boolean
  onPress: () => void
  accent: string
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

function formatScheduled(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function GameCard({ game, onJoin }: { game: PublicGame; onJoin: () => void }) {
  const styles = useThemedStyles(makeStyles)
  const meta = gameTypeMeta(game.game_type as GameType)
  const label = gameLabel(game.game_type as GameType) || game.title || 'Game'
  const isScheduled = game.status === 'scheduled'
  const isLobby = game.status === 'waiting'
  const count = game.max_players != null ? `${game.playerCount}/${game.max_players}` : `${game.playerCount}`
  const statusLine = isScheduled
    ? `Scheduled · ${formatScheduled(game.scheduled_at)}`
    : isLobby
      ? `Waiting for players · ${count} player${game.playerCount === 1 ? '' : 's'}`
      : game.status === 'active'
        ? `In progress · ${count} player${game.playerCount === 1 ? '' : 's'}`
        : 'Finished'

  return (
    <SurfaceCard>
      <View style={styles.cardRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeEmoji}>{meta.emoji}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {statusLine}
          </Text>
        </View>
        <AppButton
          label={isScheduled ? 'RSVP' : isLobby ? 'Join' : 'Watch'}
          onPress={onJoin}
          size="sm"
          tone={isScheduled || isLobby ? 'primary' : 'secondary'}
        />
      </View>
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    scroll: { padding: theme.space.md, gap: theme.space.md, paddingBottom: theme.space.xl },
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

    list: { gap: theme.space.sm },
    center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
    emptyCard: { alignItems: 'center', gap: theme.space.sm, paddingVertical: theme.space.lg },
    emptyIcon: { fontSize: 36 },
    emptyTitle: { color: theme.text, fontSize: theme.type.section.size, fontWeight: '800' },
    emptyBody: { color: theme.textMuted, fontSize: theme.type.body.size, textAlign: 'center', maxWidth: 300 },

    cardRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
    badge: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: theme.primarySoft,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeEmoji: { fontSize: 22 },
    cardBody: { flex: 1, gap: 2 },
    cardTitle: { color: theme.text, fontSize: theme.type.section.size, fontWeight: '800' },
    cardSub: { color: theme.textMuted, fontSize: theme.type.caption.size },

    previewBlock: { gap: theme.space.sm },
    previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: {
      color: theme.text,
      fontSize: theme.type.title.size,
      lineHeight: theme.type.title.lineHeight,
      fontWeight: theme.type.title.weight,
      letterSpacing: theme.type.title.letterSpacing,
    },
    seeAll: { color: theme.primary, fontSize: theme.type.label.size, fontWeight: '700' },
    previewList: { gap: theme.space.xs },
  })
