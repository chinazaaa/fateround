import { ScrollView, StyleSheet, Text, View } from 'react-native'

export type LeaderboardRow = {
  id?: string
  name: string
  score: number | string
  highlight?: boolean
}

export function LeaderboardPanel({
  title = 'Leaderboard',
  rows,
  highlightId,
  scoreSuffix = ' pts',
}: {
  title?: string
  rows: LeaderboardRow[]
  highlightId?: string | null
  scoreSuffix?: string
}) {
  if (rows.length === 0) return null

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView style={styles.list} nestedScrollEnabled>
        {rows.map((row, index) => {
          const highlight = row.highlight ?? (highlightId ? row.id === highlightId : index === 0)
          const scoreText = typeof row.score === 'number' ? `${row.score}${scoreSuffix}` : row.score
          return (
            <View key={`${row.name}-${index}`} style={[styles.row, highlight && styles.rowHighlight]}>
              <Text style={styles.rank}>{index + 1}</Text>
              <Text style={styles.name}>{row.name}</Text>
              <Text style={styles.score}>{scoreText}</Text>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#17171d',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    maxHeight: 220,
  },
  title: {
    color: '#fda4af',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a35',
  },
  rowHighlight: {
    backgroundColor: '#3f1d2b22',
  },
  rank: {
    color: '#6b7280',
    fontWeight: '700',
    width: 20,
  },
  name: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  score: {
    color: '#fda4af',
    fontWeight: '700',
    fontSize: 14,
  },
})
