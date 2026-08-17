/**
 * YourUpcomingGamesStrip — mobile home "Your upcoming games" list.
 *
 * Merges two sources: games this device has RSVP'd to (from /api/rsvps/mine)
 * and scheduled games this device hosts (enumerated via the SecureStore
 * host-codes manifest). Above three rows collapses to "See all (N)" so the
 * strip stays tight on Home. Auto-hides when both sets are empty.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import type { GameType } from '@fateround/shared'
import { ListRow } from '@/components/ui/ListRow'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { gameLabel } from '@/lib/mobile-registry'
import { gameTypeMeta } from '@/lib/game-type-meta'
import { fetchMyUpcoming, type UpcomingRsvpRow } from '@/lib/rsvp-api'
import { getHostedGameCodes } from '@/lib/secure-session'
import { getSupabase } from '@/lib/supabase'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const COLLAPSE_THRESHOLD = 3

type Row = UpcomingRsvpRow & { hosting?: boolean }

async function fetchHostedScheduled(): Promise<Row[]> {
  const codes = await getHostedGameCodes()
  if (codes.length === 0) return []
  const { data } = await getSupabase()
    .from('games')
    .select('id, title, game_type, status, scheduled_at, is_public, max_players')
    .in('id', codes)
    .eq('status', 'scheduled')
  return (data ?? []).map((r) => ({ ...(r as UpcomingRsvpRow), hosting: true }))
}

function merge(rsvped: UpcomingRsvpRow[], hosted: Row[]): Row[] {
  const seen = new Set<string>()
  const out: Row[] = []
  for (const r of hosted) {
    seen.add(r.id)
    out.push(r)
  }
  for (const r of rsvped) {
    if (seen.has(r.id)) continue
    out.push(r)
  }
  return out.sort((a, b) => {
    const ax = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
    const bx = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
    return ax - bx
  })
}

function formatScheduled(iso: string | null): string {
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

export function YourUpcomingGamesStrip() {
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)
  const [rows, setRows] = useState<Row[]>([])
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    const [rsvped, hosted] = await Promise.all([fetchMyUpcoming(), fetchHostedScheduled()])
    setRows(merge(rsvped, hosted))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const visible = useMemo(() => (expanded ? rows : rows.slice(0, COLLAPSE_THRESHOLD)), [rows, expanded])
  const hidden = rows.length - visible.length

  if (rows.length === 0) return null

  return (
    <View style={styles.block}>
      <Text style={styles.title}>Your upcoming games</Text>
      <SurfaceCard padding={0} gap={0}>
        {visible.map((r, i) => {
          const meta = gameTypeMeta(r.game_type as GameType)
          const href = r.hosting ? `/host/${r.id}` : `/game/${r.id}`
          return (
            <ListRow
              key={r.id}
              divider={i < visible.length - 1}
              onPress={() => router.push(href as never)}
              left={
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{meta.emoji}</Text>
                </View>
              }
              title={
                <View style={styles.rowTitleWrap}>
                  <Text style={styles.rowTitle}>{gameLabel(r.game_type as GameType)}</Text>
                  {r.hosting ? (
                    <View style={styles.hostBadge}>
                      <Text style={styles.hostBadgeText}>HOSTING</Text>
                    </View>
                  ) : null}
                </View>
              }
              subtitle={formatScheduled(r.scheduled_at)}
              right={<Text style={styles.chevron}>›</Text>}
            />
          )
        })}
      </SurfaceCard>
      {hidden > 0 ? (
        <Pressable onPress={() => setExpanded(true)} style={styles.seeAllPress}>
          <Text style={styles.seeAllText}>See all ({rows.length}) →</Text>
        </Pressable>
      ) : expanded && rows.length > COLLAPSE_THRESHOLD ? (
        <Pressable onPress={() => setExpanded(false)} style={styles.seeAllPress}>
          <Text style={styles.seeAllTextMuted}>Show fewer</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    block: { gap: theme.space.sm },
    title: {
      color: theme.text,
      fontSize: theme.type.title.size,
      lineHeight: theme.type.title.lineHeight,
      fontWeight: theme.type.title.weight,
      letterSpacing: theme.type.title.letterSpacing,
      marginBottom: 2,
    },
    badge: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.primarySoft,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { fontSize: 20 },
    rowTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowTitle: { color: theme.text, fontSize: theme.type.section.size, fontWeight: '800' },
    hostBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: theme.primarySoft,
    },
    hostBadgeText: {
      color: theme.primary,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1,
    },
    chevron: { color: theme.textFaint, fontSize: 22 },
    seeAllPress: { alignItems: 'center', paddingVertical: theme.space.sm },
    seeAllText: { color: theme.primary, fontSize: theme.type.label.size, fontWeight: '700' },
    seeAllTextMuted: { color: theme.textMuted, fontSize: theme.type.label.size, fontWeight: '600' },
  })
