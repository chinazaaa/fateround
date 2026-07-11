import { StyleSheet, Text, View } from 'react-native'
import type { CustomSlot } from '@fateround/shared'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import type { CustomTally } from './custom-results'

type Props = {
  tally: CustomTally
  slots: CustomSlot[]
  myAssignment?: Record<string, string> | null
  photoById?: Map<string, string | null>
}

/** Per-round custom results: "Most <label>" winner tiles + per-participant breakdown bars. */
export function CustomRoundResults({ tally, slots, myAssignment, photoById }: Props) {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.wrap}>
      {/* Winners summary */}
      <View style={styles.card}>
        <Text style={styles.header}>
          Round results · {tally.voterCount} {tally.voterCount === 1 ? 'vote' : 'votes'}
        </Text>
        <View style={styles.winnerGrid}>
          {slots.map((slot) => {
            const winner = tally.slotWinners[slot.key]
            return (
              <View key={slot.key} style={styles.winnerTile}>
                <Text style={styles.winnerEmoji}>{slot.emoji}</Text>
                <Text style={styles.winnerLabel}>Most {slot.label}</Text>
                <Text style={styles.winnerName} numberOfLines={1}>
                  {winner?.name ?? '—'}
                </Text>
                {winner ? <Text style={styles.winnerCount}>{winner.count} votes</Text> : null}
              </View>
            )
          })}
        </View>
      </View>

      {/* Per-participant breakdown */}
      {tally.rows.map((row) => {
        const maxCount = Math.max(1, ...Object.values(row.counts))
        const mySlotKey = myAssignment?.[row.participantId]
        const mySlotMeta = mySlotKey ? slots.find((s) => s.key === mySlotKey) : null
        return (
          <View key={row.participantId} style={styles.card}>
            <View style={styles.rowHead}>
              <ParticipantAvatar name={row.name} photoUrl={photoById?.get(row.participantId)} size={40} />
              <View style={styles.rowHeadText}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {row.name}
                </Text>
                {mySlotMeta ? (
                  <Text style={[styles.rowYou, { color: mySlotMeta.color }]}>
                    You: {mySlotMeta.emoji} {mySlotMeta.label}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.barGrid}>
              {slots.map((slot) => {
                const count = row.counts[slot.key] ?? 0
                const pct = Math.min((count / maxCount) * 100, 100)
                const isWinner = tally.slotWinners[slot.key]?.name === row.name
                return (
                  <View key={slot.key} style={styles.barCol}>
                    <View style={styles.barTop}>
                      <Text style={[styles.barEmoji, { color: slot.color }]}>{slot.emoji}</Text>
                      <Text style={styles.barCount}>{count}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: isWinner ? slot.color : `${slot.color}80`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )
      })}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: 12 },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 10,
    },
    header: {
      color: theme.textMuted,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1,
      textAlign: 'center',
      fontWeight: '700',
    },
    winnerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    winnerTile: {
      flexGrow: 1,
      flexBasis: 84,
      backgroundColor: theme.bg,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 6,
      alignItems: 'center',
      gap: 2,
    },
    winnerEmoji: { fontSize: 20 },
    winnerLabel: {
      color: theme.textMuted,
      fontSize: 9,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      textAlign: 'center',
    },
    winnerName: { color: theme.text, fontSize: 13, fontWeight: '700', textAlign: 'center' },
    winnerCount: { color: theme.textMuted, fontSize: 10 },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowHeadText: { flex: 1, minWidth: 0 },
    rowName: { color: theme.text, fontSize: 16, fontWeight: '800' },
    rowYou: { fontSize: 12, marginTop: 1, fontWeight: '600' },
    barGrid: { flexDirection: 'row', gap: 8 },
    barCol: { flex: 1, gap: 4 },
    barTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    barEmoji: { fontSize: 13 },
    barCount: { color: theme.text, fontSize: 13, fontWeight: '800' },
    barTrack: {
      height: 6,
      borderRadius: 999,
      backgroundColor: theme.border,
      overflow: 'hidden',
    },
    barFill: { height: '100%', borderRadius: 999 },
  })
