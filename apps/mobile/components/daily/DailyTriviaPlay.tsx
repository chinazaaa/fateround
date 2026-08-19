/**
 * Daily Trivia play surface (mobile).
 *
 * Mobile port of `src/components/daily/DailyTriviaPlay.tsx`. Same gameplay
 * shape: single question at a time, 90s countdown, answers persisted to
 * AsyncStorage so a mid-round app kill can resume, auto-submit on the last
 * answer or on timeout.
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

interface TriviaQuestion {
  question: string
  choices: string[]
}

interface SavedAnswer {
  questionIndex: number
  choiceIndex: number
}

interface Props {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

export function DailyTriviaPlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const questions = useMemo(() => (puzzle.questions ?? []) as TriviaQuestion[], [puzzle.questions])

  const [startAtMs, setStartAtMs] = useState<number | null>(null)
  const [answers, setAnswers] = useState<SavedAnswer[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const submitRef = useRef(false)

  // Load persisted attempt (or create a fresh startedAt) before starting the
  // timer, so a reopened attempt continues from where it left off.
  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const started = await getOrCreateStartedAt(challengeId)
      const saved = (await loadDailyAnswers<SavedAnswer[]>(challengeId)) ?? []
      if (cancelled) return
      setStartAtMs(started)
      setAnswers(saved)
      setCurrentIndex(saved.length)
      setHydrated(true)
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [challengeId])

  useEffect(() => {
    if (!hydrated || submitted) return
    void saveDailyAnswers(challengeId, answers)
  }, [challengeId, answers, hydrated, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: hydrated && !submitted,
    startAtMs: startAtMs ?? undefined,
  })

  const doSubmit = useCallback(
    (finalAnswers: SavedAnswer[]) => {
      if (submitRef.current) return
      submitRef.current = true
      setSubmitted(true)
      void clearDailyProgress(challengeId)
      onSubmit({
        timeSeconds: Math.min(elapsed, maxSeconds),
        submission: {
          answers: finalAnswers.map((a) => ({ questionIndex: a.questionIndex, choiceIndex: a.choiceIndex })),
        },
      })
    },
    [challengeId, elapsed, maxSeconds, onSubmit]
  )

  useEffect(() => {
    if (isTimeUp && !submitRef.current) doSubmit(answers)
  }, [isTimeUp, doSubmit, answers])

  // Auto-submit once every question is answered.
  useEffect(() => {
    if (
      answers.length >= questions.length &&
      questions.length > 0 &&
      !submitRef.current &&
      !showFeedback
    ) {
      doSubmit(answers)
    }
  }, [answers, questions.length, doSubmit, showFeedback])

  const handleAnswer = (choiceIndex: number) => {
    if (submitted || showFeedback) return
    setSelectedChoice(choiceIndex)
    setShowFeedback(true)

    const newAnswer: SavedAnswer = { questionIndex: currentIndex, choiceIndex }
    setTimeout(() => {
      setAnswers((prev) => [...prev, newAnswer])
      setCurrentIndex((prev) => prev + 1)
      setSelectedChoice(null)
      setShowFeedback(false)
    }, 500)
  }

  const confirmSubmit = () => {
    if (submitRef.current) return
    Alert.alert(
      'Submit now?',
      "You can't undo this — the leaderboard uses whatever's here right now.",
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Submit', style: 'destructive', onPress: () => doSubmit(answers) },
      ]
    )
  }

  const question = currentIndex < questions.length ? questions[currentIndex] : null
  const answeredCount = answers.length
  const timerColor = elapsed >= maxSeconds - 10 ? theme.error : theme.text

  return (
    <View style={styles.wrap}>
      <View style={[styles.timerBar, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={styles.timerCount}>
          {answeredCount} / {questions.length} answered
        </Text>
        <Text style={[styles.timerClock, { color: timerColor }]}>{formatted}</Text>
      </View>

      <Text style={styles.instructions}>
        Tap a choice for each question. Every correct answer scores points — speed matters.
      </Text>

      {question ? (
        <View style={styles.play}>
          <View style={[styles.questionCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text style={styles.qKicker}>Question {currentIndex + 1}</Text>
            <Text style={styles.qText}>{question.question}</Text>
          </View>

          <View style={styles.choices}>
            {question.choices.map((choice, i) => {
              const isSelected = selectedChoice === i
              return (
                <Pressable
                  key={i}
                  onPress={() => handleAnswer(i)}
                  disabled={showFeedback || submitted}
                  style={({ pressed }) => [
                    styles.choice,
                    {
                      borderColor: isSelected ? theme.primary : theme.border,
                      backgroundColor: isSelected ? theme.surfaceHover : theme.surface,
                      opacity: pressed && !showFeedback ? 0.85 : 1,
                    },
                  ]}
                >
                  <View style={[styles.choiceLetter, { backgroundColor: theme.bg }]}>
                    <Text style={styles.choiceLetterText}>{String.fromCharCode(65 + i)}</Text>
                  </View>
                  <Text style={styles.choiceText}>{choice}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : (
        !submitted && (
          <View style={styles.doneWrap}>
            <Text style={styles.doneTitle}>All questions answered!</Text>
            <Text style={styles.doneBody}>Submitting…</Text>
          </View>
        )
      )}

      {question && answers.length > 0 && !submitted ? (
        <AppButton
          label={`Submit (${answers.length}/${questions.length})`}
          tone="secondary"
          fullWidth
          size="sm"
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
    timerCount: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700', fontVariant: ['tabular-nums'] },
    timerClock: { fontSize: theme.type.body.size, fontWeight: '800', fontVariant: ['tabular-nums'] },
    instructions: { color: theme.textFaint, fontSize: theme.type.caption.size, textAlign: 'center' },
    play: { gap: 12 },
    questionCard: { padding: 18, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
    qKicker: {
      color: theme.textFaint,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 2,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    qText: { color: theme.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    choices: { gap: 8 },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 2,
      gap: 10,
    },
    choiceLetter: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    choiceLetterText: { color: theme.textMuted, fontSize: 12, fontWeight: '800' },
    choiceText: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '600', flex: 1 },
    doneWrap: { alignItems: 'center', paddingVertical: 40, gap: 4 },
    doneTitle: { color: theme.text, fontSize: theme.type.title.size, fontWeight: '800' },
    doneBody: { color: theme.textMuted, fontSize: theme.type.body.size },
  })
