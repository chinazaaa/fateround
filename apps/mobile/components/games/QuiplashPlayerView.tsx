import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  type Game,
  type Player,
  type QuiplashAnswer,
  type QuiplashSession,
  type QuiplashVote,
  type Round,
} from '@fateround/shared'
import { batch5GameLabel } from '@fateround/shared/batch-5-games'
import {
  QUIPLASH_MAX_ANSWER_LENGTH,
  answerAuthorName,
  answerOptionLabel,
  canPlayerVoteInRound,
  countVotesForRound,
  parseQuiplashMetadata,
  phaseDeadlineCountdown,
  quiplashRoundVotingHint,
  revealCountdownSeconds,
  roundVoteOptions,
  soloRoundPoints,
  tallyQuiplashScores,
} from '@fateround/shared/quiplash'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { PhaseStepper } from '@/components/party/PhaseStepper'
import { RoundBreakCard } from '@/components/party/RoundBreakCard'
import { LeaderboardPanel } from '@/components/ui/LeaderboardPanel'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postQuiplashAnswer, postQuiplashVote } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import {
  QUIPLASH_ANSWER_SELECT,
  QUIPLASH_SESSION_SELECT,
  QUIPLASH_VOTE_SELECT,
  ROUND_SELECT,
} from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { scoreListLeaderboard } from '@/lib/finish-leaderboards'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function QuiplashPlayerView({ gameCode }: { gameCode: string }) {
  const [rounds, setRounds] = useState<Round[]>([])
  const [session, setSession] = useState<QuiplashSession | null>(null)
  const [answers, setAnswers] = useState<QuiplashAnswer[]>([])
  const [votes, setVotes] = useState<QuiplashVote[]>([])
  const [answerText, setAnswerText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [revealCountdown, setRevealCountdown] = useState(0)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: null; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [rdsRes, sessRes, ansRes, voteRes] = await Promise.all([
        getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', code).order('round_number'),
        getSupabase().from('quiplash_sessions').select(QUIPLASH_SESSION_SELECT).eq('game_id', code).maybeSingle(),
        getSupabase().from('quiplash_answers').select(QUIPLASH_ANSWER_SELECT).eq('game_id', code),
        getSupabase().from('quiplash_votes').select(QUIPLASH_VOTE_SELECT).eq('game_id', code),
      ])
      if (rdsRes.error || sessRes.error || ansRes.error || voteRes.error) return { state: null, ok: false }
      setRounds((rdsRes.data as Round[]) ?? [])
      setSession(sessRes.data as QuiplashSession | null)
      setAnswers((ansRes.data as QuiplashAnswer[]) ?? [])
      setVotes((voteRes.data as QuiplashVote[]) ?? [])
      return { state: null, ok: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null): Screen => {
    if (game.status === 'finished') return 'finished'
    if (!playerId) return 'join'
    if (game.status === 'waiting') return 'waiting'
    return 'playing'
  }, [])

  const bootstrap = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen,
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      'rounds',
      'quiplash_sessions',
      'quiplash_answers',
      'quiplash_votes',
    ],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const currentRound = useMemo(() => {
    if (!bootstrap.game) return null
    const byPointer = rounds.find((r) => r.round_number === bootstrap.game!.current_round_number) ?? null
    const active = rounds.find((r) => r.status === 'active') ?? null
    return active ?? byPointer
  }, [bootstrap.game, rounds])

  const metadata = currentRound ? parseQuiplashMetadata(currentRound.quiplash_metadata) : null
  const roundAnswers = currentRound ? answers.filter((a) => a.round_id === currentRound.id) : []
  const myAnswer = roundAnswers.find((a) => a.player_id === bootstrap.myPlayerId)
  const voteOptions = bootstrap.myPlayerId ? roundVoteOptions(roundAnswers, bootstrap.myPlayerId) : roundAnswers
  const myVote = currentRound
    ? votes.find((v) => v.round_id === currentRound.id && v.player_id === bootstrap.myPlayerId)
    : undefined
  const canVote =
    session?.phase === 'voting' &&
    !!bootstrap.myPlayerId &&
    canPlayerVoteInRound(roundAnswers, bootstrap.myPlayerId)
  const revealTally = currentRound ? countVotesForRound(currentRound.id, votes) : []
  const topVoteCount = revealTally[0]?.votes ?? 0
  const soloRound = roundAnswers.length === 1
  const soloPoints = soloRound ? soloRoundPoints(bootstrap.players.length) : 0

  const liveLeaderboard = useMemo(
    () => tallyQuiplashScores([], answers, bootstrap.players, votes),
    [answers, bootstrap.players, votes]
  )

  const revealAnswers = useMemo(() => {
    if (!currentRound) return []
    const byVotes = new Map(revealTally.map((row) => [row.answerId, row.votes]))
    return [...roundAnswers].sort(
      (a, b) => (byVotes.get(b.id) ?? 0) - (byVotes.get(a.id) ?? 0) || a.text.localeCompare(b.text)
    )
  }, [currentRound, roundAnswers, revealTally])

  const phaseIndex =
    session?.phase === 'writing' ? 0 : session?.phase === 'voting' ? 1 : session?.phase === 'reveal' ? 2 : 0

  const votingHint = quiplashRoundVotingHint({
    canVote,
    hasVoted: !!myVote,
    cannotParticipate: !bootstrap.myPlayerId,
    answerCount: roundAnswers.length,
  })

  useEffect(() => {
    if (!session?.turn_deadline_at) {
      setCountdown(0)
      return
    }
    const tick = () => setCountdown(phaseDeadlineCountdown(session.turn_deadline_at))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [session?.turn_deadline_at, session?.phase])

  useEffect(() => {
    if (session?.phase !== 'reveal' || !currentRound?.ended_at) {
      setRevealCountdown(0)
      return
    }
    const tick = () => setRevealCountdown(revealCountdownSeconds(currentRound.ended_at))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [session?.phase, currentRound?.ended_at])

  const submitAnswer = async () => {
    if (!bootstrap.myResumeToken || !currentRound || submitting || myAnswer) return
    const text = answerText.trim()
    if (!text) return
    setSubmitting(true)
    try {
      await postQuiplashAnswer(bootstrap.code, bootstrap.myResumeToken, currentRound.id, text)
      setAnswerText('')
      await bootstrap.load()
    } finally {
      setSubmitting(false)
    }
  }

  const submitVote = async (chosenAnswerId: string) => {
    if (!bootstrap.myResumeToken || !currentRound || submitting || myVote) return
    setSubmitting(true)
    try {
      await postQuiplashVote(bootstrap.code, bootstrap.myResumeToken, currentRound.id, chosenAnswerId)
      await bootstrap.load()
    } finally {
      setSubmitting(false)
    }
  }

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />
  if (bootstrap.screen === 'join' && bootstrap.game) {
    return (
      <JoinScreen
        gameCode={bootstrap.code}
        joinName={bootstrap.joinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onChangeName={bootstrap.setJoinName}
        onJoin={() => void bootstrap.join()}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const scores = tallyQuiplashScores([], answers, bootstrap.players, votes)
    const top = scores[0]
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('quiplash')} subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title="Game over" subtitle="Final standings" detail={top ? `${top.name} — ${top.score} pts` : undefined} leaderboard={scoreListLeaderboard(scores)} />
      </GameShell>
    )
  }

  if (!currentRound || !session) {
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('quiplash')} subtitle={bootstrap.code}>
        <Text style={styles.waiting}>Waiting for the next round…</Text>
      </GameShell>
    )
  }

  return (
    <GameShell bootstrap={bootstrap} title={batch5GameLabel('quiplash')} subtitle={`Round ${currentRound.round_number}`}>
      <PhaseStepper steps={['Write', 'Vote', 'Results']} activeIndex={phaseIndex} />

      <LeaderboardPanel
        title="Live scores"
        rows={liveLeaderboard.map((row) => ({
          id: row.id,
          name: row.name,
          score: row.score,
          highlight: row.id === bootstrap.myPlayerId,
        }))}
        highlightId={bootstrap.myPlayerId}
      />

      {metadata ? <Text style={styles.prompt}>{metadata.prompt}</Text> : null}
      {countdown > 0 ? <TimerBadge seconds={countdown} /> : null}

      {session.phase === 'writing' ? (
        myAnswer ? (
          <View style={styles.submittedCard}>
            <Text style={styles.submittedLabel}>Your answer</Text>
            <Text style={styles.submittedText}>{myAnswer.text}</Text>
            <Text style={styles.locked}>Waiting for voting…</Text>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={answerText}
              onChangeText={setAnswerText}
              placeholder="Your funny answer…"
              placeholderTextColor="#6b7280"
              maxLength={QUIPLASH_MAX_ANSWER_LENGTH}
              multiline
            />
            <Pressable style={styles.primaryBtn} disabled={submitting} onPress={() => void submitAnswer()}>
              <Text style={styles.primaryText}>Submit answer</Text>
            </Pressable>
          </>
        )
      ) : null}

      {session.phase === 'voting' ? (
        <>
          <Text style={styles.section}>{votingHint}</Text>
          <View style={styles.choices}>
            {voteOptions.map((answer, index) => (
              <Pressable
                key={answer.id}
                style={[styles.choice, myVote?.chosen_answer_id === answer.id && styles.choiceSelected]}
                disabled={submitting || !!myVote || !canVote}
                onPress={() => void submitVote(answer.id)}
              >
                <Text style={styles.choiceBadge}>{answerOptionLabel(index)}</Text>
                <Text style={styles.choiceText}>{answer.text}</Text>
              </Pressable>
            ))}
          </View>
          {myVote ? <Text style={styles.locked}>Vote locked in</Text> : null}
        </>
      ) : null}

      {session.phase === 'reveal' ? (
        <>
          {soloRound ? (
            <View style={styles.soloBanner}>
              <Text style={styles.soloText}>
                Solo round — {soloPoints} pt{soloPoints === 1 ? '' : 's'} for the only answer
              </Text>
            </View>
          ) : null}
          <ScrollView contentContainerStyle={styles.revealList}>
            {revealAnswers.map((answer) => {
              const tally = revealTally.find((t) => t.answerId === answer.id)
              const votes = tally?.votes ?? 0
              const isTop = votes > 0 && votes === topVoteCount
              return (
                <View key={answer.id} style={[styles.revealRow, isTop && styles.revealRowTop]}>
                  <Text style={styles.revealText}>{answer.text}</Text>
                  <Text style={styles.revealMeta}>
                    {answerAuthorName(answer.id, roundAnswers, bootstrap.players)} · {votes} vote
                    {votes === 1 ? '' : 's'}
                    {votes > 0 ? ` · +${votes} pts` : ''}
                  </Text>
                </View>
              )
            })}
          </ScrollView>
          {revealCountdown > 0 ? (
            <RoundBreakCard
              title="Round results"
              message="Next round starting soon…"
              secondsLeft={revealCountdown}
            />
          ) : null}
        </>
      ) : null}
    </GameShell>
  )
}

const styles = StyleSheet.create({
  waiting: { color: '#9ca3af', fontSize: 16, textAlign: 'center', marginTop: 24 },
  prompt: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 28 },
  section: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 8 },
  submittedCard: {
    backgroundColor: '#17171d',
    borderRadius: 12,
    padding: 14,
    gap: 6,
    marginTop: 8,
  },
  submittedLabel: { color: '#9ca3af', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  submittedText: { color: '#fff', fontSize: 16, lineHeight: 22 },
  soloBanner: {
    backgroundColor: '#422006',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fbbf24',
    marginTop: 8,
  },
  soloText: { color: '#fcd34d', fontWeight: '700', textAlign: 'center' },
  input: {
    backgroundColor: '#17171d',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a35',
    color: '#fff',
    padding: 12,
    minHeight: 96,
    fontSize: 16,
    marginTop: 8,
  },
  primaryBtn: {
    backgroundColor: '#f43f5e',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  choices: { gap: 10, marginTop: 8 },
  choice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#17171d',
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
  choiceText: { color: '#fff', fontSize: 16, flex: 1, lineHeight: 22 },
  locked: { color: '#9ca3af', textAlign: 'center', marginTop: 12 },
  revealList: { gap: 10, paddingVertical: 8 },
  revealRow: { backgroundColor: '#17171d', borderRadius: 10, padding: 12, gap: 4 },
  revealRowTop: { borderWidth: 1, borderColor: '#fbbf24', backgroundColor: '#42200633' },
  revealText: { color: '#fff', fontSize: 16 },
  revealMeta: { color: '#9ca3af', fontSize: 13 },
})
