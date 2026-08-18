/**
 * Daily Word Grouping (Connections-style) play surface (mobile).
 *
 * Port of `src/components/daily/DailyWordGroupingPlay.tsx`. Preserves the
 * Connections feel: 4×4 grid of words, pick four, submit; up to 4 mistakes
 * before it locks; groups reveal in place in their difficulty color.
 * Same in-play correctness check as web via `puzzle._groups` (set by the
 * server on the stripped payload — see `stripSolution` in
 * src/lib/daily-challenge.ts).
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
import { AppButton } from '@/components/ui/AppButton'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

interface Props {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

interface Guess {
  words: string[]
}

interface RevealedGroup {
  category: string
  words: string[]
  difficulty: number
}

interface SavedState {
  guesses: Guess[]
  revealedGroups: RevealedGroup[]
  mistakes: number
}

const GROUP_COLORS: Record<number, string> = {
  1: '#f9df6d',
  2: '#a0c35a',
  3: '#b0c4ef',
  4: '#ba81c5',
}

const MAX_MISTAKES = 4

export function DailyWordGroupingPlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const words = useMemo(() => (puzzle.words ?? []) as string[], [puzzle.words])

  const solutionGroups = useMemo(
    () =>
      (((puzzle as Record<string, unknown>)._groups ?? []) as Array<{
        category: string
        words: string[]
        difficulty: number
      }>),
    [puzzle]
  )

  const [hydrated, setHydrated] = useState(false)
  const [startAtMs, setStartAtMs] = useState<number | null>(null)
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [revealedGroups, setRevealedGroups] = useState<RevealedGroup[]>([])
  const [mistakes, setMistakes] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [oneAway, setOneAway] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const started = await getOrCreateStartedAt(challengeId)
      const saved = await loadDailyAnswers<SavedState>(challengeId)
      if (cancelled) return
      setStartAtMs(started)
      if (saved) {
        setGuesses(saved.guesses ?? [])
        setRevealedGroups(saved.revealedGroups ?? [])
        setMistakes(saved.mistakes ?? 0)
      }
      setHydrated(true)
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [challengeId])

  useEffect(() => {
    if (!hydrated || submitted) return
    void saveDailyAnswers<SavedState>(challengeId, { guesses, revealedGroups, mistakes })
  }, [challengeId, guesses, hydrated, mistakes, revealedGroups, submitted])

  const revealedWords = useMemo(() => new Set(revealedGroups.flatMap((g) => g.words)), [revealedGroups])
  const remainingWords = useMemo(() => words.filter((w) => !revealedWords.has(w)), [revealedWords, words])
  const isSolved = revealedGroups.length === 4
  const isLost = mistakes >= MAX_MISTAKES
  const mistakesRemaining = MAX_MISTAKES - mistakes

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: hydrated && !submitted && !isSolved,
    startAtMs: startAtMs ?? undefined,
  })

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    void clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: Math.min(elapsed, maxSeconds),
      submission: { guesses },
    })
  }, [challengeId, elapsed, guesses, maxSeconds, onSubmit])

  useEffect(() => {
    if (isTimeUp && !submitRef.current) handleSubmit()
  }, [isTimeUp, handleSubmit])

  // 2.8s solve reveal (matches web) so the completed grid is visible before the results screen.
  useEffect(() => {
    if (!isSolved || submitRef.current) return
    const t = setTimeout(() => {
      if (!submitRef.current) handleSubmit()
    }, 2800)
    return () => clearTimeout(t)
  }, [isSolved, handleSubmit])

  useEffect(() => {
    if (isLost && !submitRef.current) handleSubmit()
  }, [isLost, handleSubmit])

  const toggleWord = (word: string) => {
    if (submitted || isSolved || isLost) return
    setSelected((prev) => {
      if (prev.includes(word)) return prev.filter((w) => w !== word)
      if (prev.length >= 4) return prev
      return [...prev, word]
    })
  }

  const checkGuess = useCallback(
    (guessWords: string[]): RevealedGroup | null => {
      const sorted = [...guessWords].sort()
      for (const group of solutionGroups) {
        const groupSorted = [...group.words].sort()
        if (groupSorted.length === sorted.length && groupSorted.every((w, i) => w === sorted[i])) {
          return { category: group.category, words: group.words, difficulty: group.difficulty }
        }
      }
      return null
    },
    [solutionGroups]
  )

  const checkOneAway = useCallback(
    (guessWords: string[]): boolean => {
      for (const group of solutionGroups) {
        const overlap = guessWords.filter((w) => group.words.includes(w)).length
        if (overlap === 3) return true
      }
      return false
    },
    [solutionGroups]
  )

  const submitGuess = () => {
    if (selected.length !== 4 || submitted || isSolved || isLost) return
    const guess: Guess = { words: [...selected] }
    const match = checkGuess(selected)
    if (match) {
      setGuesses((prev) => [...prev, guess])
      setRevealedGroups((prev) => [...prev, match])
      setSelected([])
    } else {
      const away = checkOneAway(selected)
      setGuesses((prev) => [...prev, guess])
      setMistakes((prev) => prev + 1)
      if (away) {
        setOneAway(true)
        setTimeout(() => setOneAway(false), 1500)
      }
      setTimeout(() => setSelected([]), 400)
    }
  }

  const endEarly = () => {
    Alert.alert('End game?', 'The leaderboard will use the groups you have so far.', [
      { text: 'Keep playing', style: 'cancel' },
      { text: 'End', style: 'destructive', onPress: handleSubmit },
    ])
  }

  const timerColor = elapsed >= maxSeconds - 10 ? theme.error : theme.text

  return (
    <View style={styles.wrap}>
      <View style={[styles.timerBar, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <View style={styles.mistakesRow}>
          <Text style={styles.mistakesLabel}>Mistakes</Text>
          <View style={styles.dots}>
            {Array.from({ length: MAX_MISTAKES }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i < mistakesRemaining ? theme.textMuted : theme.error,
                    opacity: i < mistakesRemaining ? 1 : 0.35,
                  },
                ]}
              />
            ))}
          </View>
        </View>
        <Text style={[styles.timerClock, { color: timerColor }]}>{formatted}</Text>
      </View>

      <Text style={styles.instructions}>
        Find four groups of four words that share something in common. Select four, then Submit.
      </Text>

      {oneAway ? (
        <View style={[styles.oneAway, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={styles.oneAwayText}>One away!</Text>
        </View>
      ) : null}

      {revealedGroups.map((group) => (
        <View
          key={group.category}
          style={[styles.solvedGroup, { backgroundColor: GROUP_COLORS[group.difficulty] ?? GROUP_COLORS[1] }]}
        >
          <Text style={styles.solvedTitle}>{group.category}</Text>
          <Text style={styles.solvedWords}>{group.words.join(', ')}</Text>
        </View>
      ))}

      {remainingWords.length > 0 && !submitted ? (
        <View style={styles.grid}>
          {remainingWords.map((word) => {
            const isSelected = selected.includes(word)
            return (
              <Pressable
                key={word}
                onPress={() => toggleWord(word)}
                disabled={submitted || isSolved || isLost}
                style={[
                  styles.wordButton,
                  {
                    backgroundColor: isSelected ? theme.surfaceHover : theme.surface,
                    borderColor: isSelected ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text style={styles.wordText} numberOfLines={2}>
                  {word}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {!submitted && !isSolved && !isLost && remainingWords.length > 0 ? (
        <View style={styles.actionsRow}>
          <View style={{ flex: 1 }}>
            <AppButton
              label="Deselect all"
              tone="secondary"
              size="sm"
              fullWidth
              onPress={() => setSelected([])}
              disabled={selected.length === 0}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton label="Submit" size="sm" fullWidth onPress={submitGuess} disabled={selected.length !== 4} />
          </View>
        </View>
      ) : null}

      {!submitted && guesses.length > 0 && !isSolved && !isLost ? (
        <AppButton
          label={`End game (${revealedGroups.length}/4 groups found)`}
          tone="ghost"
          fullWidth
          size="sm"
          onPress={endEarly}
        />
      ) : null}

      {!submitted && isSolved ? (
        <View style={styles.endState}>
          <Text style={styles.endTitle}>Puzzle solved!</Text>
          <Text style={styles.endBody}>Submitting…</Text>
        </View>
      ) : null}
      {!submitted && isLost ? (
        <View style={styles.endState}>
          <Text style={styles.endTitle}>Out of guesses</Text>
          <Text style={styles.endBody}>Submitting…</Text>
        </View>
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
    mistakesRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    mistakesLabel: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700' },
    dots: { flexDirection: 'row', gap: 4 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    timerClock: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
    instructions: { color: theme.textFaint, fontSize: theme.type.caption.size, textAlign: 'center' },
    oneAway: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      alignSelf: 'center',
    },
    oneAwayText: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '800' },
    solvedGroup: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
    solvedTitle: { color: '#1a1a1a', fontSize: theme.type.body.size, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
    solvedWords: { color: '#1a1a1a', fontSize: theme.type.body.size, fontWeight: '600', marginTop: 4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    wordButton: {
      width: '23%',
      minHeight: 56,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 2,
    },
    wordText: { color: theme.text, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', textAlign: 'center' },
    actionsRow: { flexDirection: 'row', gap: 8 },
    endState: { alignItems: 'center', paddingVertical: 20, gap: 4 },
    endTitle: { color: theme.text, fontSize: theme.type.title.size, fontWeight: '800' },
    endBody: { color: theme.textMuted, fontSize: theme.type.body.size },
  })
