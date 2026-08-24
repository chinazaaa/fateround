/**
 * The death/clear ticker. A race is ten levels for up to six runners with unlimited deaths, so
 * only the tail is ever shown and `TROLL_RUN_FEED_HISTORY` caps what callers need to hold.
 */

import { StyleSheet, Text, View } from 'react-native'
import type { TrollRunEvent } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const TROLL_RUN_FEED_VISIBLE = 4
export const TROLL_RUN_FEED_HISTORY = 40

export function TrollRunLiveFeed({
  events,
  playerNames,
}: {
  events: TrollRunEvent[]
  playerNames: Map<string, string>
}) {
  const styles = useThemedStyles(makeStyles)

  const seen = new Set<string>()
  const recent = events
    .filter((event) => {
      if (!event.id || seen.has(event.id)) return false
      seen.add(event.id)
      return true
    })
    .slice(-TROLL_RUN_FEED_VISIBLE)
    .reverse()

  if (recent.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>🏁 Race underway — watch out for sneaky traps</Text>
      </View>
    )
  }

  return (
    <View style={styles.list}>
      {recent.map((event) => {
        const name = playerNames.get(event.player_id) ?? event.player_name ?? 'Player'
        const isDeath = event.event_type === 'death'
        return (
          <View key={event.id} style={[styles.row, isDeath ? styles.rowDeath : styles.rowClear]}>
            <Text style={styles.rowText} numberOfLines={1}>
              <Text style={styles.rowName}>
                {isDeath ? '💀 ' : '🏁 '}
                {name}
              </Text>
              <Text style={styles.rowVerb}>{isDeath ? ' fell for a trap on ' : ' cleared '}</Text>
              <Text style={styles.rowLevel}>{event.level_name || event.level_id}</Text>
            </Text>
            {!isDeath && typeof event.time_ms === 'number' && event.time_ms > 0 ? (
              <Text style={styles.rowTime}>{(event.time_ms / 1000).toFixed(1)}s</Text>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { gap: 5 },
    empty: {
      paddingVertical: 10,
      paddingHorizontal: theme.space.md,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.bgElevated,
      alignItems: 'center',
    },
    emptyText: { color: theme.textFaint, fontSize: theme.type.caption.size },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.xs,
      paddingHorizontal: theme.space.md,
      paddingVertical: 6,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
    },
    rowDeath: { borderColor: theme.error, backgroundColor: theme.surface },
    rowClear: { borderColor: theme.success, backgroundColor: theme.surface },
    rowText: { flexShrink: 1, fontSize: theme.type.caption.size },
    rowName: { color: theme.text, fontWeight: '700' },
    rowVerb: { color: theme.textMuted },
    rowLevel: { color: theme.primary, fontWeight: '600' },
    rowTime: { color: theme.success, fontSize: 10, fontWeight: '700' },
  })
