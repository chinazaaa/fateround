/**
 * Daily Word Search play surface (mobile).
 *
 * Port of `src/components/daily/DailyWordSearchPlay.tsx`. The web board uses
 * pointer-drag across cells; on mobile we use a two-tap interaction (tap the
 * first letter, tap the last letter) which is more forgiving on small touch
 * targets. The word check is unchanged — same "match or reversed match"
 * against the puzzle's word list.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from 'expo-router'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import {
  clearDailyProgress,
  getOrCreateStartedAt,
  loadDailyAnswers,
  saveDailyAnswers,
} from '@/lib/daily-progress'
import { AppButton } from '@/components/ui/AppButton'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

interface Props {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

interface WordSearchMetadata {
  size: number
  grid: string[][]
  words: string[]
}

interface WordSearchProgress {
  foundWords: string[]
  myFoundCells: boolean[][]
}

export function DailyWordSearchPlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const metadata = puzzle.metadata as WordSearchMetadata
  const size = metadata?.size ?? 0
  const totalWords = metadata?.words?.length ?? 0

  // Disable the native stack's swipe-back gesture while the grid is mounted.
  // Without this, dragging horizontally across the grid to select a word
  // triggers the navigator's edge-swipe and pops the screen mid-select. The
  // multiplayer WordSearchBoardView already does this for the same reason.
  const navigation = useNavigation()
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false })
    return () => {
      navigation.setOptions({ gestureEnabled: true })
    }
  }, [navigation])

  const [hydrated, setHydrated] = useState(false)
  const [startAtMs, setStartAtMs] = useState<number | null>(null)
  const [foundWords, setFoundWords] = useState<string[]>([])
  const [myFoundCells, setMyFoundCells] = useState<boolean[][]>(() =>
    Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  )
  const [firstTap, setFirstTap] = useState<[number, number] | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const started = await getOrCreateStartedAt(challengeId)
      const saved = await loadDailyAnswers<WordSearchProgress>(challengeId)
      if (cancelled) return
      setStartAtMs(started)
      if (saved) {
        setFoundWords(saved.foundWords ?? [])
        if (Array.isArray(saved.myFoundCells) && saved.myFoundCells.length === size) {
          setMyFoundCells(saved.myFoundCells)
        }
      }
      setHydrated(true)
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [challengeId, size])

  useEffect(() => {
    if (!hydrated || submitted) return
    void saveDailyAnswers<WordSearchProgress>(challengeId, { foundWords, myFoundCells })
  }, [challengeId, foundWords, myFoundCells, hydrated, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: hydrated && !submitted,
    startAtMs: startAtMs ?? undefined,
  })

  const wordsSet = useMemo(
    () => new Set((metadata?.words ?? []).map((w) => w.toUpperCase())),
    [metadata?.words]
  )
  const foundSet = useMemo(() => new Set(foundWords.map((w) => w.toUpperCase())), [foundWords])

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    void clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: elapsed,
      submission: { words: foundWords, hintsUsed: 0 },
    })
  }, [challengeId, elapsed, foundWords, onSubmit])

  useEffect(() => {
    if (isTimeUp && !submitted) handleSubmit()
  }, [isTimeUp, submitted, handleSubmit])

  useEffect(() => {
    if (foundWords.length === totalWords && totalWords > 0 && !submitted) {
      handleSubmit()
    }
  }, [foundWords.length, totalWords, submitted, handleSubmit])

  const trySelect = useCallback(
    (start: [number, number], end: [number, number]) => {
      const [sr, sc] = start
      const [er, ec] = end
      const dr = er === sr ? 0 : er > sr ? 1 : -1
      const dc = ec === sc ? 0 : ec > sc ? 1 : -1
      const rowDiff = Math.abs(er - sr)
      const colDiff = Math.abs(ec - sc)
      // Only straight lines (row / col / diagonal) count — same as web.
      if (rowDiff !== colDiff && rowDiff !== 0 && colDiff !== 0) return false
      const steps = Math.max(rowDiff, colDiff)

      let word = ''
      const cells: Array<[number, number]> = []
      for (let i = 0; i <= steps; i++) {
        const r = sr + dr * i
        const c = sc + dc * i
        word += metadata.grid[r]?.[c] ?? ''
        cells.push([r, c])
      }
      const upper = word.toUpperCase()
      const reversed = upper.split('').reverse().join('')
      const match = wordsSet.has(upper) ? upper : wordsSet.has(reversed) ? reversed : null
      if (!match || foundSet.has(match)) return false

      setFoundWords((prev) => [...prev, match])
      setMyFoundCells((prev) => {
        const next = prev.map((row) => [...row])
        for (const [r, c] of cells) next[r][c] = true
        return next
      })
      return true
    },
    [foundSet, metadata?.grid, wordsSet]
  )

  const onCellPress = useCallback(
    (r: number, c: number) => {
      if (submitted) return
      if (!firstTap) {
        setFirstTap([r, c])
        return
      }
      // Second tap: attempt selection. Same cell = clear first tap.
      const same = firstTap[0] === r && firstTap[1] === c
      if (same) {
        setFirstTap(null)
        return
      }
      trySelect(firstTap, [r, c])
      setFirstTap(null)
    },
    [firstTap, submitted, trySelect]
  )

  const confirmSubmit = () => {
    Alert.alert(
      'Submit now?',
      "You can't undo this — the leaderboard uses whatever's here right now.",
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Submit', style: 'destructive', onPress: handleSubmit },
      ]
    )
  }

  const timerColor = isTimeUp ? theme.error : theme.text

  return (
    <View style={styles.wrap}>
      <View style={[styles.timerBar, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={styles.timerLabel}>
          Found: <Text style={styles.timerNumber}>{foundWords.length}/{totalWords}</Text>
        </Text>
        <Text style={[styles.timerClock, { color: timerColor }]}>{formatted}</Text>
      </View>

      <Text style={styles.instructions}>
        Find every hidden word. Tap the first letter, then tap the last letter to select.
      </Text>

      <View style={[styles.wordsCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <View style={styles.wordsRow}>
          {(metadata?.words ?? []).map((word, i) => {
            const found = foundSet.has(word.toUpperCase())
            return (
              <View
                key={i}
                style={[
                  styles.wordChip,
                  {
                    backgroundColor: found ? theme.borderAccent : theme.bg,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.wordChipText,
                    {
                      color: found ? theme.primary : theme.textMuted,
                      textDecorationLine: found ? 'line-through' : 'none',
                    },
                  ]}
                >
                  {word}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      <View style={styles.board}>
        {metadata?.grid?.map((row, r) => (
          <View key={r} style={styles.boardRow}>
            {row.map((cell, c) => {
              const isFound = myFoundCells[r]?.[c]
              const isFirst = firstTap && firstTap[0] === r && firstTap[1] === c
              const bg = isFirst ? theme.primary : isFound ? theme.borderAccent : theme.surface
              const color = isFirst ? '#fff' : isFound ? theme.primary : theme.text
              return (
                <Pressable
                  key={c}
                  onPress={() => onCellPress(r, c)}
                  disabled={submitted}
                  style={[
                    styles.cell,
                    { backgroundColor: bg, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.cellText, { color }]}>{cell.toUpperCase()}</Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>

      {!submitted && !isTimeUp && foundWords.length > 0 && foundWords.length < totalWords ? (
        <AppButton
          label={`Submit (${foundWords.length}/${totalWords})`}
          fullWidth
          size="md"
          onPress={confirmSubmit}
        />
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md, padding: theme.space.md },
    timerBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    timerLabel: { color: theme.textMuted, fontSize: theme.type.body.size },
    timerNumber: { color: theme.text, fontWeight: '800', fontVariant: ['tabular-nums'] },
    timerClock: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
    instructions: { color: theme.textFaint, fontSize: theme.type.caption.size, textAlign: 'center' },
    wordsCard: { padding: 10, borderRadius: 12, borderWidth: 1 },
    wordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    wordChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    wordChipText: { fontSize: 12, fontWeight: '700' },
    board: { alignSelf: 'center', gap: 2 },
    boardRow: { flexDirection: 'row', gap: 2 },
    cell: {
      width: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
    },
    cellText: { fontSize: 13, fontWeight: '700' },
  })
