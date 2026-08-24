import { useCallback, useEffect, useMemo, useState } from 'react'
import { uniqueTopic } from '@/lib/realtime'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, Player, Round, TriviaAnswer } from '@fateround/shared'
import {
  formatTriviaChoiceLabel,
  parseTriviaMetadata,
  revealCountdownSeconds,
  tallyTriviaPlayerScores,
  TRIVIA_REVEAL_SECONDS,
} from '@fateround/shared/trivia'
import { postFinishGame, postPlayAgain, postTriviaAdvance } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, TRIVIA_ANSWER_SELECT } from '@/lib/supabase-selects'
import { useTriviaAutoAdvance } from '@/hooks/useTriviaAutoAdvance'
import { HostChrome } from '@/components/host/HostChrome'
import { GameFinishedScreen } from '@/components/game/GameChrome'
import { GameFinishedActions } from '@/components/lifecycle/GameFinishedActions'
import { LeaderboardPanel } from '@/components/ui/LeaderboardPanel'
import { triviaLeaderboard } from '@/lib/finish-leaderboards'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  onReload: () => void
}

export function TriviaHostScreen({ gameCode, hostToken, game, players, onReload }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [rounds, setRounds] = useState<Round[]>([])
  const [answers, setAnswers] = useState<TriviaAnswer[]>([])
  const [forcing, setForcing] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealCountdown, setRevealCountdown] = useState(TRIVIA_REVEAL_SECONDS)

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

  const activeRound = useMemo(() => rounds.find((r) => r.status === 'active') ?? null, [rounds])
  const lastFinishedRound = useMemo(() => {
    const finished = rounds.filter((r) => r.status === 'finished')
    return finished.length ? finished[finished.length - 1] : null
  }, [rounds])
  const meta = activeRound ? parseTriviaMetadata(activeRound.trivia_metadata) : null
  const activePlayers = players.filter((p) => !p.spectator)
  const roundAnswers = activeRound ? answers.filter((a) => a.round_id === activeRound.id) : []
  const scores = tallyTriviaPlayerScores(answers, players)
  const leader = scores[0]
  const isLastRound = (game.current_round_number ?? 0) >= (game.rounds_count ?? 0)
  const betweenRounds = game.status === 'active' && !activeRound && lastFinishedRound != null

  useEffect(() => {
    if (!betweenRounds || !lastFinishedRound?.ended_at) return
    const tick = () => setRevealCountdown(revealCountdownSeconds(lastFinishedRound.ended_at))
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [betweenRounds, lastFinishedRound?.ended_at, lastFinishedRound?.id])

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

  const onFinish = () => {
    Alert.alert('End game', 'End the game for everyone now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End game',
        style: 'destructive',
        onPress: async () => {
          setActing(true)
          try {
            await postFinishGame(gameCode, hostToken)
            onReload()
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not finish')
          } finally {
            setActing(false)
          }
        },
      },
    ])
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
    <HostChrome
      gameCode={gameCode}
      hostToken={hostToken}
      game={game}
      players={players}
      onReload={onReload}
      // A host who tapped "Play along" in the lobby gets the GAME, not this console. Trivia
      // drives itself — rounds auto-advance when everyone answers or the clock expires, and
      // the server ticker backs that up — so a seated host has nothing here they need. They
      // used to get the question and its four choices rendered as plain text with nothing to
      // tap, which is how "I can't play, it's only showing the questions" happened.
      //
      // A host who did NOT take a seat still lands on this console: they are running the game
      // rather than playing it, and Force advance / End game are exactly what they came for.
      playFirstWhenSeated
    >
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

      {betweenRounds && lastFinishedRound ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Round {lastFinishedRound.round_number} results</Text>
          {(() => {
            const roundMeta = parseTriviaMetadata(lastFinishedRound.trivia_metadata)
            const finishedAnswers = answers.filter((a) => a.round_id === lastFinishedRound.id)
            return (
              <>
                {roundMeta ? (
                  <Text style={styles.correctLine}>
                    Correct: {formatTriviaChoiceLabel(roundMeta.correct_index)}.{' '}
                    {roundMeta.choices[roundMeta.correct_index]}
                  </Text>
                ) : null}
                {[...finishedAnswers]
                  .sort((a, b) => b.points - a.points || Number(b.is_correct) - Number(a.is_correct))
                  .map((a) => {
                    const player = players.find((p) => p.id === a.player_id)
                    return (
                      <View key={a.id} style={styles.resultRow}>
                        <Text style={[styles.resultName, a.is_correct ? styles.resultCorrect : styles.resultWrong]}>
                          {player?.name ?? 'Player'} — {a.is_correct ? '✓' : '✗'}
                        </Text>
                        <Text style={styles.resultPoints}>+{a.points} pts</Text>
                      </View>
                    )
                  })}
                <Text style={styles.revealCountdown}>
                  {revealCountdown > 0
                    ? isLastRound
                      ? `Final results in ${revealCountdown}s…`
                      : `Next question in ${revealCountdown}s…`
                    : isLastRound
                      ? 'Showing final results…'
                      : 'Starting next question…'}
                </Text>
              </>
            )
          })()}
        </View>
      ) : null}

      {game.status === 'active' ? (
        <LeaderboardPanel
          embedded
          title="Live leaderboard"
          rows={scores.map((row) => ({ id: row.id, name: row.name, score: row.score }))}
        />
      ) : null}

      {game.status === 'active' ? (
        <Text style={styles.autoHint}>Rounds auto-advance when everyone answers or time runs out.</Text>
      ) : null}

      {game.status === 'finished' ? (
        <GameFinishedScreen
          title="Game over"
          subtitle="Final standings"
          detail={leader ? `${leader.name} wins with ${leader.score} pts` : undefined}
          emoji="🏆"
          leaderboard={triviaLeaderboard(scores, game.rounds_count, null)}
        />
      ) : null}

      {game.status === 'active' ? (
        <Pressable
          style={[styles.primaryBtn, forcing && styles.btnDisabled]}
          disabled={forcing}
          onPress={() => void onForceAdvance()}
        >
          {forcing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Force advance</Text>}
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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
    stat: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      gap: 8,
    },
    cardLabel: { color: theme.primaryMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    question: { color: theme.text, fontSize: 17, fontWeight: '700', lineHeight: 24 },
    choice: { color: theme.textSecondary, fontSize: 15, lineHeight: 22 },
    answerCount: { color: theme.textMuted, fontSize: 14, marginTop: 4 },
    autoHint: { color: theme.textMuted, fontSize: 14, textAlign: 'center' },
    correctLine: { color: theme.text, fontSize: 15, fontWeight: '600', lineHeight: 22 },
    resultRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    resultName: { fontSize: 15, fontWeight: '600', flex: 1 },
    resultCorrect: { color: theme.success },
    resultWrong: { color: theme.textMuted },
    resultPoints: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
    revealCountdown: { color: theme.primaryMuted, fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 4 },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    // White on the solid rose button — intentional, correct in both schemes.
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    secondaryBtn: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 14,
      alignItems: 'center',
    },
    secondaryBtnText: { color: theme.text, fontWeight: '600' },
    btnDisabled: { opacity: 0.5 },
    error: { color: theme.error, fontSize: 14 },
  })
