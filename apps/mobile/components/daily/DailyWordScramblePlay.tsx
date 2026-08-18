/**
 * Daily Word Scramble play surface (mobile).
 * Mobile port of `src/components/daily/DailyWordScramblePlay.tsx`.
 *
 * Same shape as web: current-word card, text input with Go button, Skip,
 * Hint (−80 pts), solved-words badges, auto-submit on full solve or timeout,
 * manual Submit once at least one word was skipped. AsyncStorage-persisted
 * progress mirrors the web's localStorage attempt.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
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
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

interface ScrambleMetadata {
  scrambles: string[]
  count: number
  theme?: string
  hints?: string[]
}

// `skipped` is a Set at runtime; persist as an array because JSON can't handle Sets.
interface ScrambleProgress {
  solved: Array<{ index: number; word: string }>
  skipped: number[]
  currentIndex: number
  hintedIndices: number[]
}

const HINT_COST = 80

export function DailyWordScramblePlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const metadata = puzzle.metadata as ScrambleMetadata
  const scrambles = metadata?.scrambles ?? []
  const hints = metadata?.hints ?? []
  const answerHashes = (puzzle.answer_hashes as string[] | undefined) ?? []
  const totalWords = scrambles.length

  const [hydrated, setHydrated] = useState(false)
  const [startAtMs, setStartAtMs] = useState<number | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [solved, setSolved] = useState<Array<{ index: number; word: string }>>([])
  const [skipped, setSkipped] = useState<Set<number>>(() => new Set())
  const [hintedIndices, setHintedIndices] = useState<Set<number>>(() => new Set())
  const [guess, setGuess] = useState('')
  const [wrongGuess, setWrongGuess] = useState(false)
  const [showingHint, setShowingHint] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const started = await getOrCreateStartedAt(challengeId)
      const saved = await loadDailyAnswers<ScrambleProgress>(challengeId)
      if (cancelled) return
      setStartAtMs(started)
      if (saved) {
        setSolved(saved.solved ?? [])
        setSkipped(new Set(saved.skipped ?? []))
        setHintedIndices(new Set(saved.hintedIndices ?? []))
        setCurrentIndex(saved.currentIndex ?? 0)
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
    void saveDailyAnswers<ScrambleProgress>(challengeId, {
      solved,
      skipped: [...skipped],
      currentIndex,
      hintedIndices: [...hintedIndices],
    })
  }, [challengeId, solved, skipped, currentIndex, hintedIndices, hydrated, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: hydrated && !submitted,
    startAtMs: startAtMs ?? undefined,
  })

  const solvedIndices = new Set(solved.map((s) => s.index))

  const handleSubmitAll = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    void clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: elapsed,
      submission: { answers: solved, hintsUsed: hintedIndices.size },
    })
  }, [challengeId, elapsed, hintedIndices.size, onSubmit, solved])

  useEffect(() => {
    if (isTimeUp && !submitted) handleSubmitAll()
  }, [isTimeUp, submitted, handleSubmitAll])

  useEffect(() => {
    if (solved.length === totalWords && totalWords > 0 && !submitted) {
      handleSubmitAll()
    }
  }, [solved.length, totalWords, submitted, handleSubmitAll])

  const findNextUnsolved = useCallback(
    (from: number) => {
      if (totalWords === 0) return -1
      for (let i = 0; i < totalWords; i++) {
        const idx = (from + i) % totalWords
        if (!solvedIndices.has(idx)) return idx
      }
      return -1
    },
    [totalWords, solvedIndices]
  )

  const handleGuessSubmit = useCallback(() => {
    if (!guess.trim() || submitted) return
    const word = guess.trim()
    const expected = answerHashes[currentIndex]
    if (expected && hashWord(word) !== expected) {
      setWrongGuess(true)
      inputRef.current?.focus()
      return
    }
    setSolved((prev) => [...prev, { index: currentIndex, word }])
    setGuess('')
    setWrongGuess(false)
    setShowingHint(false)
    const next = findNextUnsolved(currentIndex + 1)
    if (next >= 0) setCurrentIndex(next)
    inputRef.current?.focus()
  }, [answerHashes, currentIndex, findNextUnsolved, guess, submitted])

  const handleSkip = useCallback(() => {
    if (submitted) return
    setSkipped((prev) => {
      const next = new Set(prev)
      next.add(currentIndex)
      return next
    })
    setGuess('')
    setWrongGuess(false)
    setShowingHint(false)
    const next = findNextUnsolved(currentIndex + 1)
    if (next >= 0) setCurrentIndex(next)
  }, [currentIndex, findNextUnsolved, submitted])

  const handleUseHint = useCallback(() => {
    if (submitted || hintedIndices.has(currentIndex)) return
    const hint = hints[currentIndex]
    if (!hint) return
    Alert.alert(
      'Use hint?',
      `This deducts ${HINT_COST} pts from your final score (out of 1000). Show the hint?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Show hint',
          onPress: () => {
            if (submitRef.current) return
            setHintedIndices((prev) => {
              const next = new Set(prev)
              next.add(currentIndex)
              return next
            })
            setShowingHint(true)
          },
        },
      ]
    )
  }, [currentIndex, hintedIndices, hints, submitted])

  const confirmSubmit = () => {
    if (submitRef.current) return
    Alert.alert(
      'Submit now?',
      "You can't undo this — the leaderboard uses whatever's here right now.",
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Submit', style: 'destructive', onPress: handleSubmitAll },
      ]
    )
  }

  const currentScramble = scrambles[currentIndex] ?? ''
  const currentHint = hints[currentIndex] ?? ''
  const isHinted = hintedIndices.has(currentIndex)
  const hintVisible = isHinted || showingHint
  const hintPenalty = hintedIndices.size * HINT_COST
  const allSolved = solved.length >= totalWords && totalWords > 0
  const hasSkipped = skipped.size > 0
  const timerColor = isTimeUp ? theme.error : theme.text

  return (
    <View style={styles.wrap}>
      <View style={[styles.timerBar, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <View style={styles.timerLeft}>
          <Text style={styles.timerLabel}>
            Solved: <Text style={styles.timerNumber}>{solved.length}/{totalWords}</Text>
          </Text>
          {hintPenalty > 0 ? (
            <Text style={[styles.penalty, { color: theme.error }]}>-{hintPenalty} pts</Text>
          ) : null}
        </View>
        <Text style={[styles.timerClock, { color: timerColor }]}>{formatted}</Text>
      </View>

      <Text style={styles.instructions}>
        Unscramble each word. Type your answer and press Go. Hints available but costly.
      </Text>

      {!allSolved && !submitted ? (
        <View style={[styles.wordCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={styles.kicker}>
            Word {currentIndex + 1} of {totalWords}
          </Text>
          <Text style={styles.scramble}>{currentScramble}</Text>

          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={guess}
              onChangeText={(v) => {
                setGuess(v)
                if (wrongGuess) setWrongGuess(false)
              }}
              onSubmitEditing={handleGuessSubmit}
              placeholder="Your answer…"
              placeholderTextColor={theme.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!submitted}
              returnKeyType="go"
              style={[
                styles.input,
                {
                  backgroundColor: theme.bg,
                  color: theme.text,
                  borderColor: wrongGuess ? theme.error : theme.border,
                },
              ]}
            />
            <AppButton
              label="Go"
              onPress={handleGuessSubmit}
              disabled={!guess.trim() || submitted}
              size="md"
            />
          </View>

          {wrongGuess ? (
            <Text style={[styles.wrongText, { color: theme.error }]}>Not quite — try again or skip.</Text>
          ) : null}

          {hintVisible && currentHint ? (
            <Text style={styles.hintText}>Hint: {currentHint}</Text>
          ) : null}

          <View style={styles.actionsRow}>
            {currentHint && !isHinted ? (
              <AppButton label={`Hint (−${HINT_COST} pts)`} tone="ghost" size="sm" onPress={handleUseHint} />
            ) : null}
            <AppButton label="Skip" tone="ghost" size="sm" onPress={handleSkip} />
          </View>
          {hasSkipped ? (
            <Text style={styles.skippedNote}>
              Skipped words come back around — or submit when you&apos;re done.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.answersCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={styles.kicker}>Your answers</Text>
        {solved.length === 0 ? (
          <Text style={styles.emptyAnswers}>Unscramble the letters to form words.</Text>
        ) : (
          <View style={styles.answerChips}>
            {solved.map((s, i) => (
              <View key={i} style={[styles.chip, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                <Text style={styles.chipText}>{s.word.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {!submitted && !allSolved && hasSkipped ? (
        <AppButton
          label={`Submit (${solved.length} words)`}
          size="lg"
          fullWidth
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
    timerLeft: { flexDirection: 'row', gap: 14, alignItems: 'center' },
    timerLabel: { color: theme.textMuted, fontSize: theme.type.body.size },
    timerNumber: { color: theme.text, fontWeight: '800', fontVariant: ['tabular-nums'] },
    penalty: { fontSize: theme.type.body.size, fontWeight: '800', fontVariant: ['tabular-nums'] },
    timerClock: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
    instructions: { color: theme.textFaint, fontSize: theme.type.caption.size, textAlign: 'center' },
    wordCard: { padding: 20, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 12 },
    kicker: {
      color: theme.textFaint,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    scramble: {
      color: theme.text,
      fontSize: 30,
      fontWeight: '800',
      letterSpacing: 8,
      textTransform: 'uppercase',
    },
    inputRow: { flexDirection: 'row', gap: 8, width: '100%', maxWidth: 320 },
    input: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      fontSize: theme.type.body.size,
    },
    wrongText: { fontSize: theme.type.caption.size },
    hintText: { color: theme.textMuted, fontSize: theme.type.body.size, fontStyle: 'italic' },
    actionsRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
    skippedNote: { color: theme.textFaint, fontSize: 11, textAlign: 'center' },
    answersCard: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 8 },
    emptyAnswers: { color: theme.textFaint, fontSize: theme.type.body.size },
    answerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    chipText: { color: theme.text, fontSize: 12, fontWeight: '700' },
  })
