import { StyleSheet, Text, View } from 'react-native'
import { HOT_SEAT_SUBMISSION_TYPES, type HotSeatSubmission } from '@fateround/shared/hot-seat'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  hotSeatPlayerName: string
  submissions: HotSeatSubmission[]
}

/**
 * Host / projected between-rounds reveal for Hot Seat. The generic
 * PollRoundResults panel has no hot-seat branch (its wyr/mlt/quote fields are
 * all null for hot seat), so the host screen renders this instead: the player
 * who was in the hot seat plus the anonymous answers about them.
 */
export function HotSeatHostReveal({ hotSeatPlayerName, submissions }: Props) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.wrap}>
      <View style={styles.spotlight}>
        <Text style={styles.spotlightEmoji}>🪑🔥</Text>
        <Text style={styles.spotlightLabel}>In the hot seat</Text>
        <Text style={styles.spotlightName}>{hotSeatPlayerName}</Text>
      </View>

      {submissions.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No submissions this round</Text>
        </View>
      ) : (
        <View style={styles.list}>
          <Text style={styles.listLabel}>What everyone said ({submissions.length})</Text>
          {submissions.map((sub) => {
            const meta = HOT_SEAT_SUBMISSION_TYPES.find((t) => t.type === sub.submission_type)
            return (
              <View key={sub.id} style={styles.subCard}>
                <Text style={styles.subEmoji}>{meta?.emoji ?? '💬'}</Text>
                <Text style={styles.subText}>{sub.text}</Text>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: 12 },
    spotlight: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: '#f59e0b66',
      padding: 20,
      alignItems: 'center',
      gap: 4,
    },
    spotlightEmoji: { fontSize: 32 },
    spotlightLabel: {
      color: '#f59e0b',
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    spotlightName: { color: theme.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
    emptyCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      paddingVertical: 24,
      alignItems: 'center',
    },
    emptyText: { color: theme.textMuted, fontSize: 14 },
    list: { gap: 10 },
    listLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      textAlign: 'center',
    },
    subCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    subEmoji: { fontSize: 22 },
    subText: { color: theme.text, fontSize: 15, lineHeight: 22, flex: 1 },
  })
