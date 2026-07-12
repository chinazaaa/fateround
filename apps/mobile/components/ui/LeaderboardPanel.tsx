import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

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
  embedded = false,
}: {
  title?: string
  rows: LeaderboardRow[]
  highlightId?: string | null
  scoreSuffix?: string
  /**
   * Set when this panel sits inside an outer ScrollView. It then renders the
   * rows in a plain View (no inner scroll, no height cap) so the page scroll
   * handles them — nesting a second vertical ScrollView here would swallow the
   * page's drag gesture and block scrolling to content below the leaderboard.
   */
  embedded?: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  if (rows.length === 0) return null

  const body = rows.map((row, index) => {
    const highlight = row.highlight ?? (highlightId ? row.id === highlightId : index === 0)
    const scoreText = typeof row.score === 'number' ? `${row.score}${scoreSuffix}` : row.score
    return (
      <View key={`${row.name}-${index}`} style={[styles.row, highlight && styles.rowHighlight]}>
        <Text style={styles.rank}>{index + 1}</Text>
        <Text style={styles.name}>{row.name}</Text>
        <Text style={styles.score}>{scoreText}</Text>
      </View>
    )
  })

  return (
    <View style={[styles.panel, embedded && styles.panelEmbedded]}>
      <Text style={styles.title}>{title}</Text>
      {embedded ? (
        <View>{body}</View>
      ) : (
        <ScrollView style={styles.list} nestedScrollEnabled>
          {body}
        </ScrollView>
      )}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    panel: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 12,
      gap: 8,
      maxHeight: 220,
    },
    // No height cap when embedded — the outer scroll owns scrolling, so the rows
    // flow inline instead of being trapped in a capped inner scroll region.
    panelEmbedded: {
      maxHeight: undefined,
    },
    title: {
      color: theme.primaryMuted,
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
      borderBottomColor: theme.border,
    },
    rowHighlight: {
      backgroundColor: theme.primarySoft,
    },
    rank: {
      color: theme.textFaint,
      fontWeight: '700',
      width: 20,
    },
    name: {
      flex: 1,
      color: theme.text,
      fontSize: 15,
      fontWeight: '600',
    },
    score: {
      color: theme.primaryMuted,
      fontWeight: '700',
      fontSize: 14,
    },
  })
