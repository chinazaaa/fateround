import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Game, Player, Round, TriviaAnswer } from '@fateround/shared'
import {
  formatTriviaChoiceLabel,
  parseTriviaMetadata,
  revealCountdownSeconds,
  tallyTriviaPlayerScores,
  TRIVIA_REVEAL_SECONDS,
} from '@fateround/shared/trivia'
import { LeaderboardPanel } from '@/components/ui/LeaderboardPanel'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { useRoundTimer } from '@/hooks/useRoundTimer'
import { useTriviaRevealAdvance } from '@/hooks/useTriviaRevealAdvance'
import { postTriviaAnswer } from '@/lib/game-api'

type PlayScreen = 'waiting' | 'active' | 'locked' | 'revealed'

type Props = {
  gameCode: string
  game: Game
  players: Player[]
  rounds: Round[]
  answers: TriviaAnswer[]
  myPlayerId: string
  myResumeToken: string | null
  onReload?: () => void
}

export function TriviaActiveRound({
  gameCode,
  game,
  players,
  rounds,
  answers,
  myPlayerId,
  myResumeToken,
  onReload,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [submittingChoice, setSubmittingChoice] = useState<number | null>(null)
  const [lastResult, setLastResult] = useState<{ isCorrect: boolean; points: number } | null>(null)
  const [timeExpired, setTimeExpired] = useState(false)
  const [expiredAtMs, setExpiredAtMs] = useState<number | null>(null)
  const [revealCountdown, setRevealCountdown] = useState(TRIVIA_REVEAL_SECONDS)
  const answerLockRef = useRef(false)

  const currentRound = useMemo(() => {
    const byPointer = rounds.find((r) => r.round_number === game.current_round_number) ?? null
    const active = rounds.find((r) => r.status === 'active') ?? null
    if (active && byPointer && active.id !== byPointer.id && byPointer.status === 'finished') return active
    return byPointer ?? active
  }, [rounds, game.current_round_number])

  const metadata = currentRound ? parseTriviaMetadata(currentRound.trivia_metadata) : null
  const myAnswer = useMemo(
    () =>
      currentRound
        ? (answers.find((a) => a.player_id === myPlayerId && a.round_id === currentRound.id) ?? null)
        : null,
    [answers, currentRound, myPlayerId]
  )

  const leaderboard = useMemo(() => tallyTriviaPlayerScores(answers, players), [answers, players])
  const isLastRound = (game.current_round_number ?? 0) >= (game.rounds_count ?? 0)

  const screen: PlayScreen = useMemo(() => {
    if (!currentRound || currentRound.status === 'pending') return 'waiting'
    if (currentRound.status === 'finished') {
      if (game.status === 'active' && currentRound.ended_at) {
        if (revealCountdownSeconds(currentRound.ended_at) <= 0) return 'waiting'
      }
      return 'revealed'
    }
    if (myAnswer || lastResult || timeExpired) return 'locked'
    return 'active'
  }, [game.status, currentRound, myAnswer, lastResult, timeExpired])

  useEffect(() => {
    setLastResult(null)
    setTimeExpired(false)
    setExpiredAtMs(null)
    setSubmittingChoice(null)
    answerLockRef.current = false
  }, [currentRound?.id])

  const showCorrectAnswer = !!metadata && (currentRound?.status === 'finished' || timeExpired)

  useEffect(() => {
    if (!showCorrectAnswer || game.status !== 'active') return

    const tick = () => {
      if (currentRound?.ended_at) {
        setRevealCountdown(revealCountdownSeconds(currentRound.ended_at))
        return
      }
      if (expiredAtMs != null) {
        const deadline = expiredAtMs + TRIVIA_REVEAL_SECONDS * 1000
        setRevealCountdown(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
      }
    }

    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [showCorrectAnswer, game.status, currentRound?.ended_at, currentRound?.id, expiredAtMs])

  const roundStillTiming = currentRound?.status === 'active' && !timeExpired

  const timeLeft = useRoundTimer({
    game,
    currentRound: currentRound?.status === 'active' ? currentRound : null,
    active: roundStillTiming,
    onExpire: () => {
      setTimeExpired(true)
      setExpiredAtMs(Date.now())
    },
  })

  useTriviaRevealAdvance({
    gameCode,
    game,
    enabled: game.status === 'active',
    onAdvanced: onReload,
  })

  const submitAnswer = useCallback(
    async (choiceIndex: number) => {
      if (!currentRound || submitting || myAnswer || answerLockRef.current || !myResumeToken) return
      answerLockRef.current = true
      setSubmitting(true)
      setSubmittingChoice(choiceIndex)
      try {
        const result = await postTriviaAnswer(gameCode, myResumeToken, currentRound.id, choiceIndex)
        setLastResult({ isCorrect: result.isCorrect, points: result.points })
        onReload?.()
      } catch {
        answerLockRef.current = false
      } finally {
        setSubmitting(false)
        setSubmittingChoice(null)
      }
    },
    [currentRound, submitting, myAnswer, gameCode, myResumeToken, onReload]
  )

  const correct = myAnswer?.is_correct ?? lastResult?.isCorrect
  const points = myAnswer?.points ?? lastResult?.points ?? 0
  const waitingOnTimer = screen === 'locked' && !timeExpired && currentRound?.status === 'active'
  const inRevealCountdown =
    showCorrectAnswer && game.status === 'active' && (revealCountdown > 0 || !currentRound?.ended_at)

  const submitAnswerStable = submitAnswer

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.header}>
        {currentRound && game.status === 'active' ? (
          <Text style={styles.roundMeta}>
            Round {currentRound.round_number} of {game.rounds_count ?? '?'}
          </Text>
        ) : null}
        {roundStillTiming ? <TimerBadge seconds={timeLeft} /> : null}
      </View>

      <LeaderboardPanel
        rows={leaderboard.map((row) => ({ id: row.id, name: row.name, score: row.score }))}
        highlightId={myPlayerId}
      />

      {screen === 'waiting' ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>
            {currentRound?.status === 'finished'
              ? isLastRound
                ? 'Wrapping up…'
                : 'Starting next question…'
              : 'Get ready…'}
          </Text>
          <Text style={styles.panelSub}>Waiting for the next question</Text>
        </View>
      ) : null}

      {screen === 'active' && metadata ? (
        <View style={styles.panel}>
          <Text style={styles.question}>{metadata.question}</Text>
          <View style={styles.choices}>
            {metadata.choices.map((choice, index) => (
              <Pressable
                key={index}
                style={[styles.choice, submittingChoice === index && styles.choiceSelected]}
                disabled={submitting}
                onPress={() => void submitAnswerStable(index)}
              >
                <Text style={styles.choiceBadge}>{formatTriviaChoiceLabel(index)}</Text>
                <Text style={styles.choiceText}>{choice}</Text>
                {submittingChoice === index ? <Text style={styles.submitting}>…</Text> : null}
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {(screen === 'locked' || screen === 'revealed') && metadata && currentRound ? (
        <View style={styles.panel}>
          {myAnswer || lastResult ? (
            <>
              <Text style={[styles.resultTitle, correct ? styles.correct : styles.incorrect]}>
                {correct ? 'Correct!' : 'Not quite…'}
              </Text>
              <Text style={styles.points}>+{points} points</Text>
            </>
          ) : (
            <Text style={styles.resultTitle}>Time's up — no answer submitted</Text>
          )}
          {showCorrectAnswer ? (
            <Text style={styles.reveal}>
              Answer: {formatTriviaChoiceLabel(metadata.correct_index)}.{' '}
              {metadata.choices[metadata.correct_index]}
            </Text>
          ) : null}
          {waitingOnTimer && (myAnswer || lastResult) ? (
            <Text style={styles.countdown}>Answer locked — results in {timeLeft}s</Text>
          ) : null}
          {showCorrectAnswer && game.status === 'active' && inRevealCountdown && revealCountdown > 0 ? (
            <Text style={styles.countdown}>
              {isLastRound ? `Final results in ${revealCountdown}s…` : `Next question in ${revealCountdown}s…`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { gap: 12, paddingBottom: 24 },
  header: { alignItems: 'center', gap: 8 },
  roundMeta: { color: '#9ca3af', fontSize: 14 },
  panel: {
    backgroundColor: '#17171d',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  panelTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  panelSub: { color: '#9ca3af', textAlign: 'center' },
  question: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 28 },
  choices: { gap: 10 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0b0b0f',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a35',
  },
  choiceSelected: { borderColor: '#f43f5e', backgroundColor: '#3f1d2b' },
  choiceBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f43f5e',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 32,
    fontWeight: '800',
  },
  choiceText: { flex: 1, color: '#fff', fontSize: 16 },
  submitting: { color: '#9ca3af' },
  resultTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  correct: { color: '#4ade80' },
  incorrect: { color: '#9ca3af' },
  points: { color: '#d1d5db', fontSize: 16, textAlign: 'center' },
  reveal: { color: '#fff', fontSize: 16, textAlign: 'center', lineHeight: 22 },
  countdown: { color: '#fda4af', fontSize: 15, fontWeight: '700', textAlign: 'center' },
})
