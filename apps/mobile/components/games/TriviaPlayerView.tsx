import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { type Game, type Player, type Round, type TriviaAnswer } from '@fateround/shared'
import { parseTriviaMetadata } from '@fateround/shared/trivia'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { FinishedPanel, GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postTriviaAnswer } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, TRIVIA_ANSWER_SELECT } from '@/lib/supabase-selects'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function TriviaPlayerView({ gameCode }: { gameCode: string }) {
  const [rounds, setRounds] = useState<Round[]>([])
  const [answers, setAnswers] = useState<TriviaAnswer[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState<{ isCorrect: boolean; points: number } | null>(null)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: null; ok: boolean }> => {
      const [roundsRes, answersRes] = await Promise.all([
        getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', gameCode.toUpperCase()).order('round_number'),
        getSupabase().from('trivia_answers').select(TRIVIA_ANSWER_SELECT).eq('game_id', gameCode.toUpperCase()),
      ])
      if (roundsRes.error || answersRes.error) return { state: null, ok: false }
      setRounds((roundsRes.data as Round[]) ?? [])
      setAnswers((answersRes.data as TriviaAnswer[]) ?? [])
      return { state: null, ok: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null): Screen => {
    if (!playerId) return 'join'
    if (game.status === 'waiting') return 'waiting'
    if (game.status === 'finished') return 'finished'
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

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'trivia_answers'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const currentRound = useMemo(() => {
    if (!bootstrap.game) return null
    const byPointer = rounds.find((r) => r.round_number === bootstrap.game!.current_round_number) ?? null
    const active = rounds.find((r) => r.status === 'active') ?? null
    if (active && byPointer && active.id !== byPointer.id && byPointer.status === 'finished') return active
    return byPointer ?? active
  }, [bootstrap.game, rounds])

  const metadata = currentRound ? parseTriviaMetadata(currentRound.trivia_metadata) : null
  const myAnswer = bootstrap.myPlayerId
    ? answers.find((a) => a.player_id === bootstrap.myPlayerId && a.round_id === currentRound?.id)
    : undefined

  const submitAnswer = async (choiceIndex: number) => {
    if (!bootstrap.myResumeToken || !currentRound || myAnswer) return
    setSubmitting(true)
    try {
      const result = await postTriviaAnswer(
        bootstrap.code,
        bootstrap.myResumeToken,
        currentRound.id,
        choiceIndex
      )
      setLastResult({ isCorrect: result.isCorrect, points: result.points })
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
  if (bootstrap.screen === 'waiting' && bootstrap.game) {
    return <LobbyView game={bootstrap.game} players={bootstrap.players} myPlayerId={bootstrap.myPlayerId} />
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const scores = tallyScores(answers, bootstrap.players)
    const top = scores[0]
    return (
      <GameShell title="Trivia" subtitle={bootstrap.code}>
        <FinishedPanel
          title="Game over"
          detail={top ? `Top score: ${top.name} (${top.score})` : undefined}
        />
      </GameShell>
    )
  }

  return (
    <GameShell title="Trivia" subtitle={`Round ${currentRound?.round_number ?? '—'}`}>
      {!currentRound || currentRound.status !== 'active' || !metadata ? (
        <Text style={styles.waiting}>Waiting for the next question…</Text>
      ) : (
        <>
          <Text style={styles.question}>{metadata.question}</Text>
          <View style={styles.choices}>
            {metadata.choices.map((choice, index) => {
              const answered = !!myAnswer
              const selected = myAnswer?.choice_index === index
              return (
                <Pressable
                  key={index}
                  style={[styles.choice, selected && styles.choiceSelected]}
                  disabled={submitting || answered}
                  onPress={() => void submitAnswer(index)}
                >
                  <Text style={styles.choiceBadge}>{String.fromCharCode(65 + index)}</Text>
                  <Text style={styles.choiceText}>{choice}</Text>
                </Pressable>
              )
            })}
          </View>
          {myAnswer ? (
            <Text style={styles.locked}>
              Answer locked{lastResult ? ` — ${lastResult.points} pts` : ''}
            </Text>
          ) : null}
        </>
      )}
    </GameShell>
  )
}

function tallyScores(answers: TriviaAnswer[], players: Player[]) {
  const totals = new Map<string, number>()
  for (const player of players) totals.set(player.id, 0)
  for (const answer of answers) {
    totals.set(answer.player_id, (totals.get(answer.player_id) ?? 0) + answer.points)
  }
  return players
    .map((player) => ({ id: player.id, name: player.name, score: totals.get(player.id) ?? 0 }))
    .sort((a, b) => b.score - a.score)
}

const styles = StyleSheet.create({
  waiting: { color: '#9ca3af', fontSize: 16, textAlign: 'center', marginTop: 24 },
  question: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 28 },
  choices: { gap: 10, marginTop: 8 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
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
  choiceText: { color: '#fff', fontSize: 16, flex: 1 },
  locked: { color: '#9ca3af', textAlign: 'center', marginTop: 8 },
})
