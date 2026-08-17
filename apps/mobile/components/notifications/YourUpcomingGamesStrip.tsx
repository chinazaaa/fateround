/**
 * YourUpcomingGamesStrip — mobile home "Your upcoming games" list.
 *
 * Shows every scheduled game the caller has RSVP'd to that hasn't started
 * yet. Powers the "I forgot I RSVP'd" reminder the plan calls for. Auto-
 * hides when the caller has no upcoming RSVPs.
 */

import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import type { GameType } from '@fateround/shared'
import { ListRow } from '@/components/ui/ListRow'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { gameLabel } from '@/lib/mobile-registry'
import { gameTypeMeta } from '@/lib/game-type-meta'
import { fetchMyUpcoming, type UpcomingRsvpRow } from '@/lib/rsvp-api'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

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
  const [rows, setRows] = useState<UpcomingRsvpRow[]>([])

  const load = useCallback(async () => {
    setRows(await fetchMyUpcoming())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Refresh whenever the home screen regains focus so a fresh RSVP or a
  // host-cancelled game reflects immediately.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  if (rows.length === 0) return null

  return (
    <View style={styles.block}>
      <Text style={styles.title}>Your upcoming games</Text>
      <SurfaceCard padding={0} gap={0}>
        {rows.map((r, i) => {
          const meta = gameTypeMeta(r.game_type as GameType)
          return (
            <ListRow
              key={r.id}
              divider={i < rows.length - 1}
              onPress={() => router.push(`/game/${r.id}` as never)}
              left={
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{meta.emoji}</Text>
                </View>
              }
              title={<Text style={styles.rowTitle}>{gameLabel(r.game_type as GameType)}</Text>}
              subtitle={formatScheduled(r.scheduled_at)}
              right={<Text style={styles.chevron}>›</Text>}
            />
          )
        })}
      </SurfaceCard>
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
    rowTitle: { color: theme.text, fontSize: theme.type.section.size, fontWeight: '800' },
    chevron: { color: theme.textFaint, fontSize: 22 },
  })
