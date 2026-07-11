import { StyleSheet, Text, View } from 'react-native'
import type { Player } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * In-game roster split into "Still playing" and "Watching" groups (mirrors the web
 * CrazyEightsStandings). Active players show a Turn badge + live card count; players
 * who emptied their hand show their finishing place (first out = 🏆 Winner) and pure
 * spectators show a Watching badge. Replaces the flat PlayerTurnRail so finishing
 * order and watch status are visible mid-game.
 */
export function CrazyEightsRoster({
  players,
  turnPlayerId,
  myPlayerId,
  handCounts,
  finishOrder,
}: {
  players: Player[]
  turnPlayerId: string | null
  myPlayerId: string | null
  handCounts: Record<string, number>
  finishOrder: string[]
}) {
  const styles = useThemedStyles(makeStyles)

  const isWatching = (p: Player) => {
    const spectator = (p as { spectator?: boolean | null }).spectator === true
    // Only treat count 0 as "out" once the player's hand row is actually loaded —
    // otherwise a not-yet-fetched hand (absent key) would flag a still-playing player.
    const hasRow = Object.prototype.hasOwnProperty.call(handCounts, p.id)
    return spectator || (hasRow && (handCounts[p.id] ?? 0) === 0)
  }

  const active = players.filter((p) => !isWatching(p))
  const watching = players.filter((p) => isWatching(p))

  const renderRow = (p: Player, watch: boolean) => {
    const count = handCounts[p.id] ?? 0
    const isTurn = !watch && p.id === turnPlayerId
    const isMe = p.id === myPlayerId
    const finishIdx = finishOrder.indexOf(p.id)
    const finished = finishIdx >= 0
    const place = finishIdx + 1
    const placeLabel =
      finishIdx === 0 ? '🏆 Winner' : `${place}${place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'}`

    return (
      <View key={p.id} style={[styles.row, isTurn && styles.rowTurn, watch && styles.rowWatch]}>
        <Text style={[styles.name, isTurn && styles.nameTurn]} numberOfLines={1}>
          {p.name}
          {isMe ? ' (you)' : ''}
        </Text>
        <View style={styles.badges}>
          {isTurn ? (
            <View style={styles.turnBadge}>
              <Text style={styles.turnBadgeText}>Turn</Text>
            </View>
          ) : null}
          {finished ? (
            <View style={[styles.placeBadge, finishIdx === 0 && styles.winBadge]}>
              <Text style={[styles.placeText, finishIdx === 0 && styles.winText]}>{placeLabel}</Text>
            </View>
          ) : watch ? (
            <View style={styles.watchBadge}>
              <Text style={styles.watchText}>Watching</Text>
            </View>
          ) : null}
          <Text style={styles.count}>
            {finished ? (finishIdx === 0 ? '🏆' : '👀') : watch ? '👀' : `${count} 🃏`}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      {active.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupLabel}>Still playing</Text>
          {active.map((p) => renderRow(p, false))}
        </View>
      ) : null}
      {watching.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupLabel}>Watching</Text>
          {watching.map((p) => renderRow(p, true))}
        </View>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { alignSelf: 'stretch', gap: theme.space.sm },
    group: { gap: 6 },
    groupLabel: {
      color: theme.textFaint,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      backgroundColor: theme.surface,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    rowTurn: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    rowWatch: { borderStyle: 'dashed', opacity: 0.75 },
    name: { color: theme.text, fontWeight: '700', fontSize: 14, flexShrink: 1 },
    nameTurn: { color: theme.text, fontWeight: '800' },
    badges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    turnBadge: {
      backgroundColor: theme.primary,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    // White on the solid rose badge — intentional in both schemes.
    turnBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    placeBadge: {
      backgroundColor: theme.bgElevated,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    winBadge: { backgroundColor: theme.primarySoft },
    placeText: { color: theme.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    winText: { color: theme.primary },
    watchBadge: {
      backgroundColor: theme.bgElevated,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    watchText: { color: theme.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    count: { color: theme.textMuted, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  })
