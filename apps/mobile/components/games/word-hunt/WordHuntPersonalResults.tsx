import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  type WordHuntSubmission,
  buildWordHuntWordList,
  sortWordHuntSubmissions,
} from '@fateround/shared/word-hunt'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const INITIAL_VISIBLE = 15

type Props = {
  submissions: Pick<WordHuntSubmission, 'word' | 'points_awarded'>[]
  validWords?: string[]
}

export function WordHuntPersonalResults({ submissions, validWords = [] }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [expanded, setExpanded] = useState(false)
  const [revealAll, setRevealAll] = useState(false)

  const sortedFound = useMemo(() => sortWordHuntSubmissions(submissions), [submissions])
  const wordCount = sortedFound.length
  const totalScore = sortedFound.reduce((sum, e) => sum + e.points_awarded, 0)

  const foundSet = useMemo(() => new Set(sortedFound.map((e) => e.word.toLowerCase())), [sortedFound])
  const allWords = useMemo(
    () => (validWords.length > 0 ? buildWordHuntWordList(validWords, foundSet) : []),
    [foundSet, validWords]
  )

  const missedCount = allWords.filter((e) => !e.found).length
  const visibleFound = expanded ? sortedFound : sortedFound.slice(0, INITIAL_VISIBLE)
  const remainingFound = Math.max(0, sortedFound.length - INITIAL_VISIBLE)

  return (
    <View style={styles.wrap}>
      <View style={styles.statCard}>
        <View>
          <Text style={styles.statLabel}>Words</Text>
          <Text style={styles.statValue}>{wordCount}</Text>
        </View>
        <View>
          <Text style={styles.statLabel}>Score</Text>
          <Text style={styles.statValue}>{totalScore}</Text>
        </View>
      </View>

      {sortedFound.length > 0 ? (
        <View style={styles.panel}>
          {visibleFound.map((entry) => (
            <WordRow key={entry.word} word={entry.word} points={entry.points_awarded} styles={styles} />
          ))}
          {remainingFound > 0 && !expanded ? (
            <Pressable onPress={() => setExpanded(true)}>
              <Text style={styles.moreLink}>({remainingFound} more)</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {allWords.length > 0 ? (
        <View style={styles.revealWrap}>
          <Pressable style={styles.revealBtn} onPress={() => setRevealAll((v) => !v)}>
            <Text style={styles.revealText}>
              🔍 {revealAll ? 'Hide all words' : 'Reveal all'}
            </Text>
            {!revealAll && missedCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{missedCount}</Text>
              </View>
            ) : null}
          </Pressable>
          {revealAll ? (
            <View style={styles.panel}>
              {allWords.map((entry) => (
                <WordRow
                  key={entry.word}
                  word={entry.word}
                  points={entry.points}
                  missed={!entry.found}
                  styles={styles}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function WordRow({
  word,
  points,
  missed = false,
  styles,
}: {
  word: string
  points: number
  missed?: boolean
  styles: ReturnType<typeof makeStyles>
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.tile, missed && styles.tileMissed]}>
        <Text style={[styles.tileText, missed && styles.tileTextMissed]}>{word.toUpperCase()}</Text>
      </View>
      <Text style={[styles.rowPts, missed && styles.rowPtsMissed]}>{points}</Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: 12 },
    statCard: {
      flexDirection: 'row',
      gap: 24,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      backgroundColor: theme.surface,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    statLabel: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    statValue: { color: theme.text, fontSize: 28, fontWeight: '900', marginTop: 2, fontVariant: ['tabular-nums'] },
    panel: {
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      backgroundColor: theme.surface,
      padding: 12,
      gap: 4,
      maxHeight: 360,
    },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 2 },
    tile: {
      minWidth: 72,
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      backgroundColor: theme.primarySoft,
    },
    tileMissed: { backgroundColor: theme.surfaceHover, borderColor: theme.border },
    tileText: { color: theme.primaryMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    tileTextMissed: { color: theme.textMuted },
    rowPts: { color: theme.text, fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
    rowPtsMissed: { color: theme.textFaint },
    moreLink: { color: theme.textMuted, fontSize: 14, fontWeight: '600', marginTop: 4 },
    revealWrap: { gap: 12 },
    revealBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: theme.radius.lg,
      borderWidth: 2,
      borderColor: theme.borderAccent,
      backgroundColor: theme.surface,
      paddingVertical: 12,
    },
    revealText: { color: theme.text, fontSize: 14, fontWeight: '900' },
    badge: {
      height: 20,
      minWidth: 20,
      paddingHorizontal: 6,
      borderRadius: 999,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // White on the solid primary badge — correct in both schemes.
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  })
