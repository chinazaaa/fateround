import { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { WORD_HUNT_MIN_WORD_LENGTH } from '@fateround/shared/word-hunt'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { WordHuntGrid } from './WordHuntGrid'
import { buildWordHuntPrefixSet, previewWordHuntDrag } from './word-hunt-preview'

type Props = {
  grid: string[][]
  selectedPath: number[]
  onPathChange: (path: number[]) => void
  onStrokeEnd: (path: number[]) => void
  foundWords: string[]
  validWords: ReadonlySet<string>
  myPoints: number
  timeLabel: string
  timeUp: boolean
  secondsLeft: number
  disabled?: boolean
}

export function WordHuntPlaySurface({
  grid,
  selectedPath,
  onPathChange,
  onStrokeEnd,
  foundWords,
  validWords,
  myPoints,
  timeLabel,
  timeUp,
  secondsLeft,
  disabled = false,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  const validPrefixes = useMemo(() => buildWordHuntPrefixSet(validWords), [validWords])
  const foundSet = useMemo(() => new Set(foundWords.map((w) => w.toLowerCase())), [foundWords])
  const preview = previewWordHuntDrag(grid, selectedPath, validWords, validPrefixes, foundSet)
  const timerUrgent = !timeUp && secondsLeft <= 10

  const chipStyle =
    preview.isValidWord && !preview.alreadyFound
      ? styles.chipValid
      : preview.prefixValid && preview.word.length >= WORD_HUNT_MIN_WORD_LENGTH
        ? styles.chipPrefix
        : preview.word
          ? styles.chipDead
          : null

  const chipTextStyle = preview.isValidWord && !preview.alreadyFound ? styles.chipTextValid : styles.chipText

  return (
    <View style={styles.card}>
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Words</Text>
          <Text style={styles.statValue}>{foundWords.length}</Text>
          <Text style={[styles.statLabel, styles.statLabelSpaced]}>Score</Text>
          <Text style={styles.statValue}>{myPoints}</Text>
        </View>
        <View style={[styles.timeBox, (timerUrgent || timeUp) && styles.timeBoxUrgent]}>
          <Text style={styles.statLabel}>Time</Text>
          <Text style={[styles.timeValue, timeUp ? styles.timeUp : timerUrgent ? styles.timeUrgent : null]}>
            {timeUp ? '0:00' : timeLabel}
          </Text>
        </View>
      </View>

      <View style={styles.previewRow}>
        {preview.word ? (
          <>
            <View style={[styles.chip, chipStyle]}>
              <Text style={[styles.chipTextBase, chipTextStyle]}>
                {preview.word.toUpperCase()}
                {preview.points != null ? ` (+${preview.points})` : ''}
                {preview.alreadyFound && preview.word.length >= WORD_HUNT_MIN_WORD_LENGTH ? ' · keep going?' : ''}
              </Text>
            </View>
            {preview.isValidWord && !preview.alreadyFound ? (
              <Pressable style={styles.submitBtn} onPress={() => onStrokeEnd(selectedPath)}>
                <Text style={styles.submitText}>Submit</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.clearBtn} onPress={() => onPathChange([])} accessibilityLabel="Clear letters">
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.hint}>Drag or tap adjacent letters</Text>
        )}
      </View>

      <View style={styles.gridWrap}>
        <WordHuntGrid
          grid={grid}
          selectedPath={selectedPath}
          onPathChange={onPathChange}
          onStrokeEnd={onStrokeEnd}
          disabled={disabled}
          validPrefixes={validPrefixes}
        />
      </View>

      <View style={styles.foundHeader}>
        <Text style={styles.foundLabel}>Words found</Text>
        <Text style={styles.foundCount}>{foundWords.length}</Text>
      </View>
      {foundWords.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.foundChips}
        >
          {foundWords.map((w) => (
            <View key={w} style={styles.foundChip}>
              <Text style={styles.foundChipText}>{w}</Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.scoringHint}>3 letters = 100 · 4 = 400 · 5 = 800 pts</Text>
      )}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      padding: 12,
      gap: 10,
    },
    statsRow: { flexDirection: 'row', gap: 10 },
    statBox: {
      flex: 1,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.primarySoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    statLabel: {
      color: theme.textMuted,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    statLabelSpaced: { marginTop: 4 },
    statValue: { color: theme.text, fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
    timeBox: {
      minWidth: 88,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.primarySoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
      alignItems: 'flex-end',
    },
    // Urgent red frame — functional state color, fixed in both schemes.
    timeBoxUrgent: { borderColor: '#dc262655', backgroundColor: '#dc26261a' },
    timeValue: { color: theme.text, fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
    timeUrgent: { color: '#f59e0b' },
    timeUp: { color: '#dc2626' },
    previewRow: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    chipValid: { backgroundColor: theme.primary, borderColor: theme.primary },
    chipPrefix: { backgroundColor: theme.primarySoft, borderColor: theme.borderAccent },
    chipDead: { backgroundColor: theme.surfaceHover, borderColor: theme.border },
    chipTextBase: { fontSize: 15, fontWeight: '900', letterSpacing: 1 },
    chipText: { color: theme.text },
    // White on the solid primary chip — correct in both schemes.
    chipTextValid: { color: '#fff' },
    submitBtn: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: theme.primary,
    },
    // White on the solid primary button — correct in both schemes.
    submitText: { color: '#fff', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
    clearBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceHover,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearText: { color: theme.textMuted, fontSize: 18, fontWeight: '700', lineHeight: 20 },
    hint: { color: theme.textMuted, fontSize: 14, fontWeight: '500', textAlign: 'center' },
    gridWrap: { paddingVertical: 4 },
    foundHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    foundLabel: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    foundCount: { color: theme.textFaint, fontSize: 10, fontVariant: ['tabular-nums'] },
    foundChips: { gap: 8, paddingVertical: 2 },
    foundChip: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: theme.primarySoft,
      borderWidth: 1,
      borderColor: theme.borderAccent,
    },
    foundChipText: { color: theme.primaryMuted, fontSize: 12, fontWeight: '700' },
    scoringHint: { color: theme.textFaint, fontSize: 11, textAlign: 'center' },
  })
