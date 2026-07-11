import { StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const MEDALS = ['🥇', '🥈', '🥉']

/**
 * Compact running standings shown during every play phase, mirroring web's
 * PaginatedLeaderboard aside. Ranked by live points from tallyNpatScores.
 */
export function ICallOnLiveLeaderboard({
  rows,
  myPlayerId,
}: {
  rows: { id: string; name: string; score: number }[]
  myPlayerId: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  if (rows.length === 0) return null

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Leaderboard</Text>
      {rows.map((row, i) => {
        const isMe = row.id === myPlayerId
        return (
          <View key={row.id} style={[styles.row, isMe && styles.rowMe]}>
            <Text style={styles.rank}>{MEDALS[i] ?? i + 1}</Text>
            <Text style={[styles.name, isMe && styles.nameMe]} numberOfLines={1}>
              {row.name}
              {isMe ? ' (you)' : ''}
            </Text>
            <Text style={styles.score}>{row.score} pts</Text>
          </View>
        )
      })}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 4,
    },
    title: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 8,
    },
    rowMe: { backgroundColor: theme.primarySoft },
    rank: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '800',
      width: 24,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    name: { flex: 1, color: theme.text, fontSize: 14, fontWeight: '600' },
    nameMe: { fontWeight: '800' },
    score: { color: theme.textSecondary, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  })
