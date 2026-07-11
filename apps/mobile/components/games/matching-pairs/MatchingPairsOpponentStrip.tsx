import { StyleSheet, Text, View } from 'react-native'
import type { MatchingPairsProgress } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

// Mirrors web OpponentProgressStrip: a live "Opponents" list under the board with a
// per-rival progress bar (pairs_matched/gridSizePairs), green + ✓ when finished,
// sorted by progress. Optionally includes the current player (used on the
// "waiting for others" screen where everyone is shown).
export function MatchingPairsOpponentStrip({
  allProgress,
  myPlayerId,
  playerName,
  gridSizePairs,
  roundId,
  includeSelf = false,
  title = 'Opponents',
}: {
  allProgress: MatchingPairsProgress[]
  myPlayerId: string | null
  playerName: (playerId: string) => string
  gridSizePairs: number
  roundId: string | null
  includeSelf?: boolean
  title?: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  const roundProgress = roundId ? allProgress.filter((p) => p.round_id === roundId) : allProgress
  const rows = includeSelf ? roundProgress : roundProgress.filter((p) => p.player_id !== myPlayerId)
  if (rows.length === 0) return null

  return (
    <View style={styles.wrap}>
      {title ? <Text style={styles.heading}>{title}</Text> : null}
      <View style={styles.list}>
        {[...rows]
          .sort((a, b) => b.pairs_matched - a.pairs_matched)
          .map((prog) => {
            const name = playerName(prog.player_id)
            const isMe = prog.player_id === myPlayerId
            const pct = Math.max(0, Math.min(100, Math.round((prog.pairs_matched / gridSizePairs) * 100)))
            return (
              <View key={prog.player_id} style={styles.row}>
                <Text style={[styles.name, isMe && styles.nameMe]} numberOfLines={1}>
                  {isMe ? 'You' : name}
                </Text>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${pct}%`, backgroundColor: prog.finished ? '#22c55e' : '#f59e0b' },
                    ]}
                  />
                </View>
                <Text style={styles.value}>
                  {prog.finished ? '✓' : `${prog.pairs_matched}/${gridSizePairs}`}
                </Text>
              </View>
            )
          })}
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border, gap: 8 },
    heading: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    list: { gap: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { color: theme.textMuted, fontSize: 12, minWidth: 84 },
    nameMe: { color: theme.text, fontWeight: '700' },
    track: { flex: 1, height: 5, borderRadius: 999, backgroundColor: theme.surfaceHover, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 999 },
    value: {
      color: theme.textMuted,
      fontSize: 11,
      minWidth: 44,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
  })
