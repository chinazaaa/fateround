import { StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type ScrabbleScoreRow = {
  id: string
  name: string
  score: number
  isTurn: boolean
  isMe: boolean
  timedOut: boolean
  /** Pre-formatted chess-clock time (e.g. "2:05"), or null when not in chess mode. */
  clockText: string | null
}

/**
 * Rich scoreboard mirroring web BoardScores: marks the player on the move with ▶,
 * the leader with 👑, shows each player's remaining chess-clock time, strikes through
 * timed-out players with an "⏳ Out of time" label, and tags "you".
 */
export function ScrabbleScoreboard({ rows }: { rows: ScrabbleScoreRow[] }) {
  const styles = useThemedStyles(makeStyles)
  // Leader = the single highest score (only when someone is actually ahead).
  const topScore = rows.length > 0 ? Math.max(...rows.map((r) => r.score)) : 0
  const leaderId =
    topScore > 0 && rows.filter((r) => r.score === topScore).length === 1
      ? rows.find((r) => r.score === topScore)?.id
      : null

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Scores</Text>
      {rows.map((row) => {
        const isLeader = row.id === leaderId
        return (
          <View key={row.id} style={[styles.row, row.isMe && styles.rowMe]}>
            <Text style={styles.turnMark}>{row.isTurn && !row.timedOut ? '▶' : ' '}</Text>
            <Text
              style={[styles.name, row.timedOut && styles.nameTimedOut]}
              numberOfLines={1}
            >
              {isLeader ? '👑 ' : ''}
              {row.name}
              {row.isMe ? <Text style={styles.youTag}> · you</Text> : null}
            </Text>
            {row.timedOut ? (
              <Text style={styles.outLabel}>⏳ Out of time</Text>
            ) : row.clockText ? (
              <Text style={styles.clock}>{row.clockText}</Text>
            ) : null}
            <Text style={styles.score}>{row.score}</Text>
          </View>
        )
      })}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    heading: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderRadius: 8,
    },
    rowMe: { backgroundColor: theme.surfaceHover },
    turnMark: {
      width: 12,
      color: theme.primary,
      fontSize: 12,
      fontWeight: '900',
    },
    name: { flex: 1, color: theme.text, fontSize: 14, fontWeight: '700' },
    nameTimedOut: { color: theme.textMuted, textDecorationLine: 'line-through' },
    youTag: { color: theme.primaryMuted, fontWeight: '600' },
    // Functional amber "out of time" tag, kept fixed across themes.
    outLabel: { color: '#f59e0b', fontSize: 11, fontWeight: '700' },
    clock: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    score: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
      fontVariant: ['tabular-nums'],
      minWidth: 28,
      textAlign: 'right',
    },
  })
