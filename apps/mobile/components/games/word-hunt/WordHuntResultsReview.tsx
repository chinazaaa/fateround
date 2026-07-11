import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  type WordHuntPlayerScore,
  type WordHuntSubmission,
  sortWordHuntSubmissions,
} from '@fateround/shared/word-hunt'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type SubmissionRow = Pick<WordHuntSubmission, 'word' | 'points_awarded' | 'player_id'>

export function WordHuntResultsReview({
  submissions,
  leaderboard,
  highlightPlayerId,
}: {
  submissions: SubmissionRow[]
  leaderboard: WordHuntPlayerScore[]
  highlightPlayerId?: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  const [expandedId, setExpandedId] = useState<string | null>(
    highlightPlayerId ?? leaderboard[0]?.player_id ?? null
  )

  const byPlayer = useMemo(() => {
    const map = new Map<string, SubmissionRow[]>()
    for (const s of submissions) {
      const list = map.get(s.player_id) ?? []
      list.push(s)
      map.set(s.player_id, list)
    }
    for (const [id, list] of map) {
      map.set(id, sortWordHuntSubmissions(list) as SubmissionRow[])
    }
    return map
  }, [submissions])

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Everyone&apos;s words</Text>
      {leaderboard.map((row, i) => {
        const words = byPlayer.get(row.player_id) ?? []
        const expanded = expandedId === row.player_id
        return (
          <View key={row.player_id} style={[styles.item, expanded && styles.itemExpanded]}>
            <Pressable
              style={styles.itemHeader}
              onPress={() => setExpandedId(expanded ? null : row.player_id)}
            >
              <Text style={styles.itemName} numberOfLines={1}>
                {i === 0 ? '🏆 ' : `${i + 1}. `}
                {row.name}
                {row.player_id === highlightPlayerId ? ' (you)' : ''}
              </Text>
              <Text style={styles.itemMeta}>
                {row.points} pts · {row.word_count}w {expanded ? '▲' : '▾'}
              </Text>
            </Pressable>
            {expanded ? (
              <View style={styles.itemBody}>
                {words.length > 0 ? (
                  <View style={styles.chipWrap}>
                    {words.map((w) => (
                      <View key={w.word} style={styles.chip}>
                        <Text style={styles.chipWord}>{w.word}</Text>
                        <Text style={styles.chipPts}>{w.points_awarded}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.empty}>No words found</Text>
                )}
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    panel: {
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      backgroundColor: theme.surface,
      padding: 12,
      gap: 8,
    },
    title: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    item: {
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
      overflow: 'hidden',
    },
    itemExpanded: { borderColor: theme.borderAccent, backgroundColor: theme.surface },
    itemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    itemName: { flex: 1, color: theme.text, fontSize: 14, fontWeight: '700' },
    itemMeta: { color: theme.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] },
    itemBody: {
      paddingHorizontal: 12,
      paddingBottom: 12,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: theme.primarySoft,
      borderWidth: 1,
      borderColor: theme.borderAccent,
    },
    chipWord: { color: theme.primaryMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    chipPts: { color: theme.textFaint, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
    empty: { color: theme.textFaint, fontSize: 13 },
  })
