import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Player } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Compact horizontal player rail for the card table — one fixed-height strip of
 * chips (name + live card count, current turn highlighted) that scrolls sideways.
 * Fixed height regardless of player count, so 6+ players never push the draw/
 * discard pile off-screen. Finished players (emptied hand) trail at the end with
 * their place (first out = 🏆). Pure spectators are NOT shown here — they live in
 * the roster drawer (the header people icon). Card counts / turn / finishing order
 * are gameplay info, so they stay on the board; the full name list is the drawer's.
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

  const isSpectator = (p: Player) => (p as { spectator?: boolean | null }).spectator === true
  const handEmpty = (p: Player) => {
    // Only treat count 0 as "out" once the player's hand row is actually loaded —
    // otherwise a not-yet-fetched hand (absent key) would flag a still-playing player.
    const hasRow = Object.prototype.hasOwnProperty.call(handCounts, p.id)
    return hasRow && (handCounts[p.id] ?? 0) === 0
  }

  // Pure spectators live in the roster drawer now; keep only players in the game.
  // Active players keep their passed (turn) order; finished trail by finishing place.
  const inGame = players.filter((p) => !isSpectator(p))
  const active = inGame.filter((p) => !handEmpty(p))
  const finished = inGame
    .filter((p) => handEmpty(p))
    .sort((a, b) => finishOrder.indexOf(a.id) - finishOrder.indexOf(b.id))
  const ordered = [...active, ...finished]
  if (ordered.length === 0) return null

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Still playing</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        keyboardShouldPersistTaps="handled"
      >
        {ordered.map((p) => {
          const count = handCounts[p.id] ?? 0
          const isTurn = p.id === turnPlayerId
          const isMe = p.id === myPlayerId
          const finishIdx = finishOrder.indexOf(p.id)
          const isFinished = finishIdx >= 0
          const place = finishIdx + 1
          const placeLabel = finishIdx === 0 ? '🏆' : `${place}${place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'}`

          return (
            <View key={p.id} style={[styles.chip, isTurn && styles.chipTurn, isFinished && styles.chipFinished]}>
              <Text style={[styles.name, isTurn && styles.nameTurn]} numberOfLines={1}>
                {p.name}
                {isMe ? ' (you)' : ''}
              </Text>
              {isFinished ? (
                <Text style={styles.place}>{placeLabel}</Text>
              ) : (
                <View style={styles.countWrap}>
                  {isTurn ? <Text style={styles.turnDot}>▸</Text> : null}
                  <Text style={[styles.count, isTurn && styles.countTurn]}>{count} 🃏</Text>
                </View>
              )}
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { alignSelf: 'stretch', gap: 6 },
    label: {
      color: theme.textFaint,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    rail: { flexDirection: 'row', gap: 8, paddingRight: 4 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.surface,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    chipTurn: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    chipFinished: { opacity: 0.7, borderStyle: 'dashed' },
    name: { color: theme.text, fontWeight: '700', fontSize: 13, maxWidth: 110 },
    nameTurn: { color: theme.text, fontWeight: '800' },
    countWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    turnDot: { color: theme.primary, fontSize: 12, fontWeight: '900' },
    count: { color: theme.textMuted, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
    countTurn: { color: theme.primary },
    place: { color: theme.textMuted, fontSize: 12, fontWeight: '800' },
  })
