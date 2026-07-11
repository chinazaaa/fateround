import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, Participant, Player, Round, Vote } from '@fateround/shared'
import { isMostLikelyTo, parseGameType, pollGameLabel } from '@fateround/shared/poll-games'
import {
  postEndRound,
  postFinishGame,
  postNextRound,
  postPlayAgain,
} from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { PARTICIPANT_SELECT, ROUND_SELECT, VOTE_SELECT } from '@/lib/supabase-selects'
import { PollRoundResults } from '@/components/games/poll/PollRoundResults'
import { HostChrome } from '@/components/host/HostChrome'
import { HostPlayAlongCard } from '@/components/host/HostPlayAlongCard'
import { LeaderboardPanel } from '@/components/ui/LeaderboardPanel'
import { mltVoteLeaderboard } from '@/lib/finish-leaderboards'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  onReload: () => void
}

export function PollRoundHostScreen({ gameCode, hostToken, game, players, onReload }: Props) {
  const [rounds, setRounds] = useState<Round[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [acting, setActing] = useState<'end' | 'next' | 'finish' | 'replay' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const gameType = parseGameType(game.game_type)

  const loadPollData = useCallback(async () => {
    const [roundsRes, participantsRes, votesRes] = await Promise.all([
      getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      getSupabase().from('participants').select(PARTICIPANT_SELECT).eq('game_id', gameCode).order('display_order'),
      getSupabase().from('votes').select(VOTE_SELECT).eq('game_id', gameCode),
    ])
    if (!roundsRes.error) setRounds((roundsRes.data as Round[]) ?? [])
    if (!participantsRes.error) setParticipants((participantsRes.data as Participant[]) ?? [])
    if (!votesRes.error) setVotes((votesRes.data as Vote[]) ?? [])
  }, [gameCode])

  useEffect(() => {
    void loadPollData()
    const supabase = getSupabase()
    const channel = supabase
      .channel(`host-poll-${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` },
        () => void loadPollData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes', filter: `game_id=eq.${gameCode}` },
        () => void loadPollData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `game_id=eq.${gameCode}` },
        () => void loadPollData()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, loadPollData])

  const activeRound = useMemo(
    () => rounds.find((r) => r.status === 'active') ?? null,
    [rounds]
  )
  const lastFinished = useMemo(() => {
    const finished = rounds.filter((r) => r.status === 'finished')
    return finished.length ? finished[finished.length - 1] : null
  }, [rounds])
  const betweenRounds = game.status === 'active' && !activeRound && !!lastFinished
  const isLastRound = (game.current_round_number ?? 0) >= (game.rounds_count ?? 0)
  const activePlayers = players.filter((p) => !p.spectator)
  const activeRoundVotes = activeRound ? votes.filter((v) => v.round_id === activeRound.id) : []
  const cumulativeMlt = isMostLikelyTo(gameType)
    ? mltVoteLeaderboard(votes, participants)
    : []

  const run = async (action: 'end' | 'next' | 'finish' | 'replay', fn: () => Promise<unknown>) => {
    setActing(action)
    setError(null)
    try {
      await fn()
      await loadPollData()
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActing(null)
    }
  }

  const roundLabel = pollGameLabel(game.game_type)

  return (
    <HostChrome gameCode={gameCode} hostToken={hostToken} game={game}>
      <View style={styles.statsRow}>
        <Text style={styles.stat}>Players: {activePlayers.length}</Text>
        <Text style={styles.stat}>
          Round {game.current_round_number ?? 0}/{game.rounds_count ?? '?'}
        </Text>
      </View>

      {game.status === 'active' && activeRound ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Live round</Text>
          <Text style={styles.cardTitle}>
            {activeRound.mlt_question ||
              activeRound.quote_text ||
              activeRound.wyr_option_a ||
              `Round ${activeRound.round_number}`}
          </Text>
          <Text style={styles.cardHint}>
            {activeRoundVotes.length}/{activePlayers.length} votes in
          </Text>
        </View>
      ) : null}

      {game.status === 'active' && betweenRounds && lastFinished ? (
        <>
          <PollRoundResults
            game={game}
            gameType={gameType}
            round={lastFinished}
            participants={participants}
            votes={votes}
            players={players}
          />
        </>
      ) : null}

      {cumulativeMlt.length > 0 ? (
        <LeaderboardPanel title="Overall votes" rows={cumulativeMlt.map((row) => ({ id: row.name, name: row.name, score: row.score }))} />
      ) : null}

      {game.status === 'active' && betweenRounds ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Between rounds</Text>
          <Text style={styles.cardHint}>
            {isLastRound
              ? 'Last round finished — finish the game when ready.'
              : 'Results are in — start the next round when ready.'}
          </Text>
        </View>
      ) : null}

      {game.status === 'finished' ? (
        <Text style={styles.finished}>Game finished — open play again to run another session.</Text>
      ) : null}

      {game.status === 'active' && activeRound ? (
        <Pressable
          style={[styles.primaryBtn, acting === 'end' && styles.btnDisabled]}
          disabled={!!acting}
          onPress={() => void run('end', () => postEndRound(gameCode, hostToken))}
        >
          {acting === 'end' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>End round</Text>
          )}
        </Pressable>
      ) : null}

      {game.status === 'active' && betweenRounds && !isLastRound ? (
        <Pressable
          style={[styles.primaryBtn, acting === 'next' && styles.btnDisabled]}
          disabled={!!acting}
          onPress={() => void run('next', () => postNextRound(gameCode, hostToken))}
        >
          {acting === 'next' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Next round</Text>
          )}
        </Pressable>
      ) : null}

      {game.status === 'active' && betweenRounds && isLastRound ? (
        <Pressable
          style={[styles.primaryBtn, acting === 'finish' && styles.btnDisabled]}
          disabled={!!acting}
          onPress={() => void run('finish', () => postFinishGame(gameCode, hostToken))}
        >
          {acting === 'finish' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Finish game</Text>
          )}
        </Pressable>
      ) : null}

      {game.status === 'active' ? (
        <Pressable
          style={[styles.secondaryBtn, acting === 'finish' && styles.btnDisabled]}
          disabled={!!acting}
          onPress={() => void run('finish', () => postFinishGame(gameCode, hostToken))}
        >
          <Text style={styles.secondaryBtnText}>End game early</Text>
        </Pressable>
      ) : null}

      <HostPlayAlongCard gameCode={gameCode} />

      {game.status === 'finished' ? (
        <Pressable
          style={[styles.primaryBtn, acting === 'replay' && styles.btnDisabled]}
          disabled={!!acting}
          onPress={() => void run('replay', () => postPlayAgain(gameCode, hostToken, true))}
        >
          {acting === 'replay' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Play again</Text>
          )}
        </Pressable>
      ) : null}

      <Text style={styles.footerHint}>{roundLabel} host controls</Text>
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
    gap: 6,
  },
  cardLabel: { color: '#fda4af', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  cardTitle: { color: '#fff', fontSize: 17, fontWeight: '700', lineHeight: 24 },
  cardHint: { color: '#9ca3af', fontSize: 14, lineHeight: 20 },
  finished: { color: '#86efac', fontSize: 16, fontWeight: '600', textAlign: 'center' },
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
  footerHint: { color: '#6b7280', fontSize: 13, textAlign: 'center' },
  error: { color: '#f87171', fontSize: 14 },
})
