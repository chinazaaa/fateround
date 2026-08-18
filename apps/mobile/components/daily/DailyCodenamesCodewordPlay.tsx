/**
 * Daily Codewords play surface (mobile).
 * Port of `src/components/daily/DailyCodenamesCodewordPlay.tsx`. One clue,
 * one number, pick that many words from a 5×5 grid, submit.
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

export function DailyCodenamesCodewordPlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const grid = useMemo(() => (puzzle.grid ?? []) as string[], [puzzle.grid])
  const clue = (puzzle.clue ?? '') as string
  const clueNumber = (puzzle.clueNumber ?? 0) as number

  const [hydrated, setHydrated] = useState(false)
  const [startAtMs, setStartAtMs] = useState<number | null>(null)
  const [selectedWords, setSelectedWords] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const started = await getOrCreateStartedAt(challengeId)
      const saved = await loadDailyAnswers<string[]>(challengeId)
      if (cancelled) return
      setStartAtMs(started)
      if (Array.isArray(saved)) setSelectedWords(saved)
      setHydrated(true)
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [challengeId])

  useEffect(() => {
    if (!hydrated || submitted) return
    void saveDailyAnswers(challengeId, selectedWords)
  }, [challengeId, hydrated, selectedWords, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: hydrated && !submitted,
    startAtMs: startAtMs ?? undefined,
  })

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    void clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: Math.min(elapsed, maxSeconds),
      submission: { selectedWords },
    })
  }, [challengeId, elapsed, maxSeconds, onSubmit, selectedWords])

  useEffect(() => {
    if (isTimeUp && !submitRef.current) handleSubmit()
  }, [isTimeUp, handleSubmit])

  const toggleWord = (word: string) => {
    if (submitted) return
    setSelectedWords((prev) => {
      if (prev.includes(word)) return prev.filter((w) => w !== word)
      if (prev.length >= clueNumber) return prev
      return [...prev, word]
    })
  }

  const confirmSubmit = () => {
    Alert.alert('Submit now?', "You can't undo this — the leaderboard uses your current picks.", [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Submit', style: 'destructive', onPress: handleSubmit },
    ])
  }

  const selectionComplete = selectedWords.length === clueNumber
  const timerColor = elapsed >= maxSeconds - 10 ? theme.error : theme.text
  const atCap = selectedWords.length >= clueNumber

  return (
    <View style={styles.wrap}>
      <Text style={styles.instructions}>
        The clue hints at words in the grid. Select the matching words (up to the clue number), then submit.
      </Text>

      <View style={[styles.clueCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={styles.clueKicker}>Clue</Text>
        <Text style={styles.clueText}>
          {clue} — {clueNumber}
        </Text>
      </View>

      <View style={[styles.timerBar, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={styles.timerLabel}>
          {selectedWords.length} / {clueNumber} selected
        </Text>
        <Text style={[styles.timerClock, { color: timerColor }]}>{formatted}</Text>
      </View>

      <View style={styles.grid}>
        {grid.map((word, i) => {
          const isSelected = selectedWords.includes(word)
          const disabled = submitted || (!isSelected && atCap)
          return (
            <Pressable
              key={i}
              onPress={() => toggleWord(word)}
              disabled={disabled}
              style={[
                styles.wordButton,
                {
                  backgroundColor: isSelected ? theme.primary : theme.surface,
                  borderColor: isSelected ? theme.primary : theme.border,
                  opacity: !isSelected && atCap ? 0.5 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.wordText,
                  { color: isSelected ? '#fff' : theme.text },
                ]}
                numberOfLines={2}
              >
                {word}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {!submitted ? (
        <AppButton
          label={`Submit (${selectedWords.length}/${clueNumber} selected)`}
          fullWidth
          size="md"
          onPress={confirmSubmit}
          disabled={!selectionComplete}
        />
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md, padding: theme.space.md },
    instructions: { color: theme.textFaint, fontSize: theme.type.caption.size, textAlign: 'center' },
    clueCard: { padding: 18, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
    clueKicker: {
      color: theme.textFaint,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 2,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    clueText: { color: theme.text, fontSize: 20, fontWeight: '800' },
    timerBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    timerLabel: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700', fontVariant: ['tabular-nums'] },
    timerClock: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    wordButton: {
      width: '18.4%',
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 2,
    },
    wordText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  })
