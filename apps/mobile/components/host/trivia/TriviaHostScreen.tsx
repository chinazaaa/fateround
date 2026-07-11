import { useCallback, useEffect, useMemo, useState } from 'react'
import { uniqueTopic } from '@/lib/realtime'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, Player, Round, TriviaAnswer } from '@fateround/shared'
import {
  formatTriviaChoiceLabel,
  parseTriviaMetadata,
  tallyTriviaPlayerScores,
} from '@fateround/shared/trivia'
import {
  postFinishGame,
  postPlayAgain,
  postTriviaAdvance,
} from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, TRIVIA_ANSWER_SELECT } from '@/lib/supabase-selects'
import { useTriviaAutoAdvance } from '@/hooks/useTriviaAutoAdvance'
import { HostChrome } from '@/components/host/HostChrome'
import { GameFinishedActions } from '@/components/lifecycle/GameFinishedActions'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  onReload: () => void
}

export function TriviaHostScreen({ gameCode, hostToken, game, players, onReload }: Props) {
  const [rounds, setRounds] = useState<Round[]>([])
  const [answers, setAnswers] = useState<TriviaAnswer[]>([])
  const [forcing, setForcing] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [roundsRes, answersRes] = await Promise.all([
      getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      getSupabase().from('trivia_answers').select(TRIVIA_ANSWER_SELECT).eq('game_id', gameCode),
    ])
    if (!roundsRes.error) setRounds((roundsRes.data as Round[]) ?? [])
    if (!answersRes.error) setAnswers((answersRes.data as TriviaAnswer[]) ?? [])
  }, [gameCode])

  useEffect(() => {
    void load()
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`host-trivia-${gameCode}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trivia_answers', filter: `game_id=eq.${gameCode}` },
        () => void load()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  useTriviaAutoAdvance({
    gameCode,
    game,
    hostToken,
    enabled: game.status === 'active',
    onSynced: () => void load(),
  })

  const activeRound = useMemo(
    () => rounds.find((r) => r.status === 'active') ?? null,
    [rounds]
  )
  const meta = activeRound ? parseTriviaMetadata(activeRound.trivia_metadata) : null
  const activePlayers = players.filter((p) => !p.spectator)
  const roundAnswers = activeRound
    ? answers.filter((a) => a.round_id === activeRound.id)
    : []
  const scores = tallyTriviaPlayerScores(answers, players)
  const leader = scores[0]

  const onForceAdvance = async () => {
    setForcing(true)
    setError(null)
    try {
      await postTriviaAdvance(gameCode, { hostToken, force: true })
      await load()
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Advance failed')
    } finally {
      setForcing(false)
    }
  }

  const onFinish = async () => {
    setActing(true)
    try {
      await postFinishGame(gameCode, hostToken)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish')
    } finally {
      setActing(false)
    }
  }

  const onPlayAgain = async () => {
    setActing(true)
    try {
      await postPlayAgain(gameCode, hostToken, true)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Play again failed')
    } finally {
      setActing(false)
    }
  }

  return (
    <HostChrome gameCode={gameCode} hostToken={hostToken} game={game} players={players} onReload={onReload}>
      <View style={styles.statsRow}>
        <Text style={styles.stat}>Players: {activePlayers.length}</Text>
        <Text style={styles.stat}>
          Round {game.current_round_number ?? 0}/{game.rounds_count ?? '?'}
        </Text>
      </View>

      {game.status === 'active' && meta ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Current question</Text>
          <Text style={styles.question}>{meta.question}</Text>
          {meta.choices.map((choice, i) => (
            <Text key={choice} style={styles.choice}>
              {formatTriviaChoiceLabel(i)}. {choice}
            </Text>
          ))}
          <Text style={styles.answerCount}>
            {roundAnswers.length}/{activePlayers.length} answered
          </Text>
        </View>
      ) : null}

      {game.status === 'active' ? (
        <Text style={styles.autoHint}>Rounds auto-advance when everyone answers or time runs out.</Text>
      ) : null}

      {game.status === 'finished' && leader ? (
        <Text style={styles.winner}>
          {leader.name} wins with {leader.score} pts
        </Text>
      ) : null}

      {game.status === 'active' ? (
        <Pressable
          style={[styles.primaryBtn, forcing && styles.btnDisabled]}
          disabled={forcing}
          onPress={() => void onForceAdvance()}
        >
          {forcing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Force advance</Text>
          )}
        </Pressable>
      ) : null}


      {game.status === 'active' ? (
        <Pressable
          style={[styles.secondaryBtn, acting && styles.btnDisabled]}
          disabled={acting}
          onPress={() => void onFinish()}
        >
          <Text style={styles.secondaryBtnText}>End game</Text>
        </Pressable>
      ) : null}

      {game.status === 'finished' ? (
        <>
          <Pressable
            style={[styles.primaryBtn, acting && styles.btnDisabled]}
            disabled={acting}
            onPress={() => void onPlayAgain()}
          >
            <Text style={styles.primaryBtnText}>Play again</Text>
          </Pressable>
          <GameFinishedActions
            gameCode={gameCode}
            gameType={game.game_type}
            gameTitle={game.title}
            resultTitle={leader ? `${leader.name} wins!` : undefined}
          />
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </HostChrome>
  )
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { color: '#9ca3af', fontSize: 14, fontWeight: '600' },
  card: {
    backgroundColor: '#17171d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a35',
    padding: 16,
    gap: 8,
  },
  cardLabel: { color: '#fda4af', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  question: { color: '#fff', fontSize: 17, fontWeight: '700', lineHeight: 24 },
  choice: { color: '#d1d5db', fontSize: 15, lineHeight: 22 },
  answerCount: { color: '#9ca3af', fontSize: 14, marginTop: 4 },
  autoHint: { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
  winner: { color: '#86efac', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  primaryBtn: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a35',
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  error: { color: '#f87171', fontSize: 14 },
})
