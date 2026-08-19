/**
 * Daily Word Hunt play surface (mobile).
 *
 * Port of `src/components/daily/DailyWordHuntPlay.tsx`. The web version uses
 * pointer-drag across cells; on mobile we build the path via sequential taps
 * (each tap must be adjacent to the previous cell). An Enter button submits
 * the current word; Clear resets the path. Same scoring and hash-based
 * validation as web — the client can reject non-words in-play without seeing
 * the answer list, and the server re-validates on submit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import {
  clearDailyProgress,
  getOrCreateStartedAt,
  loadDailyAnswers,
  saveDailyAnswers,
} from '@/lib/daily-progress'
import { hashWord } from '@/lib/daily-word-hash'
import { AppButton } from '@/components/ui/AppButton'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

interface Props {
  challengeId: string
  grid: string[][]
  validWordHashes: string[]
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

const GRID_SIZE = 4
const MIN_WORD_LENGTH = 3

function scoreWord(word: string): number {
  const len = word.length
  if (len === 3) return 100
  if (len === 4) return 400
  if (len === 5) return 800
  return 800 + (len - 5) * 400
}

function indexToRowCol(i: number): [number, number] {
  return [Math.floor(i / GRID_SIZE), i % GRID_SIZE]
}

function areAdjacent(a: number, b: number): boolean {
  const [ar, ac] = indexToRowCol(a)
  const [br, bc] = indexToRowCol(b)
  return Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1 && !(ar === br && ac === bc)
}

function letterAt(grid: string[][], index: number): string {
  const [r, c] = indexToRowCol(index)
  return grid[r]?.[c] ?? ''
}

export function DailyWordHuntPlay({
  challengeId,
  grid,
  validWordHashes,
  timer: maxSeconds,
  onSubmit,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  const [hydrated, setHydrated] = useState(false)
  const [startAtMs, setStartAtMs] = useState<number | null>(null)
  const [foundWords, setFoundWords] = useState<string[]>([])
  const [path, setPath] = useState<number[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null)
  const submitRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const started = await getOrCreateStartedAt(challengeId)
      const saved = await loadDailyAnswers<string[]>(challengeId)
      if (cancelled) return
      setStartAtMs(started)
      if (Array.isArray(saved)) setFoundWords(saved)
      setHydrated(true)
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [challengeId])

  useEffect(() => {
    if (!hydrated || submitted) return
    void saveDailyAnswers(challengeId, foundWords)
  }, [challengeId, foundWords, hydrated, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: hydrated && !submitted,
    startAtMs: startAtMs ?? undefined,
  })

  const validHashSet = useMemo(() => new Set(validWordHashes), [validWordHashes])
  const foundSet = useMemo(() => new Set(foundWords.map((w) => w.toLowerCase())), [foundWords])
  const totalPoints = foundWords.reduce((sum, w) => sum + scoreWord(w), 0)

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    void clearDailyProgress(challengeId)
    onSubmit({ timeSeconds: elapsed, submission: { words: foundWords } })
  }, [challengeId, elapsed, foundWords, onSubmit])

  useEffect(() => {
    if (isTimeUp && !submitted) handleSubmit()
  }, [isTimeUp, submitted, handleSubmit])

  const onCellPress = useCallback(
    (index: number) => {
      if (submitted) return
      setPath((prev) => {
        if (prev.length === 0) return [index]
        // Tapping the last cell = pop (undo). Tapping any already-used cell = ignore.
        const last = prev[prev.length - 1]
        if (last === index) return prev.slice(0, -1)
        if (prev.includes(index)) return prev
        if (!areAdjacent(last, index)) return prev
        return [...prev, index]
      })
      setFlash(null)
    },
    [submitted]
  )

  const trySubmitWord = useCallback(() => {
    if (submitted) return
    const word = path.map((i) => letterAt(grid, i)).join('').toLowerCase()
    if (word.length < MIN_WORD_LENGTH || !validHashSet.has(hashWord(word)) || foundSet.has(word)) {
      setFlash('bad')
      // Auto-clear the bad flash so the next attempt reads normally.
      setTimeout(() => setFlash((f) => (f === 'bad' ? null : f)), 500)
      return
    }
    setFoundWords((prev) => [...prev, word])
    setPath([])
    setFlash('ok')
    setTimeout(() => setFlash((f) => (f === 'ok' ? null : f)), 350)
  }, [foundSet, grid, path, submitted, validHashSet])

  const clearPath = () => setPath([])

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

  const currentWord = path.map((i) => letterAt(grid, i)).join('').toUpperCase()
  const timerColor = isTimeUp ? theme.error : theme.text
  const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => i)

  return (
    <View style={styles.wrap}>
      <View style={[styles.timerBar, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={styles.timerLabel}>
          Score: <Text style={styles.timerNumber}>{totalPoints}</Text>
        </Text>
        <Text style={[styles.timerClock, { color: timerColor }]}>{formatted}</Text>
      </View>

      <Text style={styles.instructions}>
        Tap adjacent letters to spell a word (tap the last letter again to undo). Longer words score more.
      </Text>

      <View
        style={[
          styles.currentWord,
          {
            borderColor:
              flash === 'ok' ? theme.primary : flash === 'bad' ? theme.error : theme.border,
            backgroundColor: theme.surface,
          },
        ]}
      >
        <Text style={styles.currentWordText}>{currentWord || 'Trace a word…'}</Text>
      </View>

      <View style={styles.board}>
        {Array.from({ length: GRID_SIZE }).map((_, r) => (
          <View key={r} style={styles.boardRow}>
            {Array.from({ length: GRID_SIZE }).map((_, c) => {
              const index = r * GRID_SIZE + c
              const inPathIndex = path.indexOf(index)
              const inPath = inPathIndex >= 0
              const isHead = inPathIndex === path.length - 1
              const bg = isHead
                ? theme.primary
                : inPath
                  ? theme.borderAccent
                  : theme.surface
              const color = isHead ? '#fff' : theme.text
              return (
                <Pressable
                  key={c}
                  onPress={() => onCellPress(index)}
                  disabled={submitted}
                  style={[
                    styles.cell,
                    { backgroundColor: bg, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.cellLetter, { color }]}>{letterAt(grid, index).toUpperCase()}</Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>

      <View style={styles.actionsRow}>
        <AppButton label="Clear" tone="ghost" size="sm" onPress={clearPath} disabled={submitted || path.length === 0} />
        <AppButton
          label="Enter"
          size="md"
          onPress={trySubmitWord}
          disabled={submitted || path.length < MIN_WORD_LENGTH}
        />
      </View>

      <View style={[styles.foundCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={styles.kicker}>Words found: {foundWords.length}</Text>
        {foundWords.length === 0 ? (
          <Text style={styles.emptyText}>Trace letters to form words.</Text>
        ) : (
          <View style={styles.foundChips}>
            {foundWords.map((w, i) => (
              <View key={i} style={[styles.chip, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                <Text style={styles.chipText}>
                  {w.toUpperCase()} +{scoreWord(w)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {!submitted && !isTimeUp && foundWords.length > 0 ? (
        <AppButton label={`Submit (${foundWords.length} words)`} fullWidth size="md" onPress={confirmSubmit} />
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
    currentWord: {
      borderRadius: 12,
      borderWidth: 2,
      paddingVertical: 14,
      alignItems: 'center',
    },
    currentWordText: {
      color: theme.text,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: 3,
    },
    board: { alignSelf: 'center', gap: 6 },
    boardRow: { flexDirection: 'row', gap: 6 },
    cell: {
      width: 62,
      height: 62,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellLetter: { fontSize: 24, fontWeight: '800' },
    actionsRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
    foundCard: { padding: 12, borderRadius: 12, borderWidth: 1, gap: 6 },
    kicker: {
      color: theme.textFaint,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    emptyText: { color: theme.textFaint, fontSize: theme.type.body.size },
    foundChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    chipText: { color: theme.text, fontSize: 12, fontWeight: '700' },
  })
