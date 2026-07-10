import { StyleSheet, Text, View } from 'react-native'
import { TeamBadge } from './TeamBadge'
import { teamChipStyle } from './team-colors'

export function TeamScoreGrid({
  scores,
  activeTeam,
  myTeam,
  round,
  totalRounds,
  title = 'Scores',
}: {
  scores: { team: number; score: number }[]
  activeTeam?: number | null
  myTeam?: number | null
  round?: number
  totalRounds?: number
  title?: string
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {round != null && totalRounds != null ? (
          <Text style={styles.roundMeta}>
            Round {Math.min(round, totalRounds)} / {totalRounds}
          </Text>
        ) : null}
      </View>
      <View style={styles.grid}>
        {scores.map((row) => {
          const colors = teamChipStyle(row.team)
          const active = activeTeam === row.team
          const mine = myTeam === row.team
          return (
            <View
              key={row.team}
              style={[
                styles.chip,
                { backgroundColor: colors.bg, borderColor: colors.border },
                active && styles.chipActive,
              ]}
            >
              <View style={styles.chipLeft}>
                <TeamBadge team={row.team} compact />
                {mine ? <Text style={styles.you}>you</Text> : null}
                {active ? <Text style={styles.clock}>⏱</Text> : null}
              </View>
              <Text style={styles.score}>{row.score}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#17171d',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: {
    color: '#fda4af',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  roundMeta: { color: '#9ca3af', fontSize: 11, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipActive: { borderWidth: 2 },
  chipLeft: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  you: { color: '#9ca3af', fontSize: 10, fontWeight: '700' },
  clock: { fontSize: 12 },
  score: { color: '#fff', fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
})
