import { useCallback, useEffect, useMemo, useState } from 'react'
import { uniqueTopic } from '@/lib/realtime'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type {
  Game,
  Player,
  QuickDrawAssignment,
  QuickDrawDrawing,
  QuickDrawGuessGuess,
  QuickDrawGuessPlayer,
  QuickDrawGuessSession,
  QuickDrawGuessWord,
  QuickDrawSession,
  QuickDrawTitle,
  QuickDrawVote,
  Round,
} from '@fateround/shared'
import { isQuickDrawGuessVariant } from '@fateround/shared/quick-draw-guess'
import {
  activeDrawingForSession,
  phaseDeadlineCountdown,
  playerDisplayName,
  tallyQuickDrawScores,
} from '@fateround/shared/quick-draw-lie'
import { normalizeStrokeData, emptyStrokeData } from '@fateround/shared/quick-draw-strokes'
import {
  postFinishGame,
  postPlayAgain,
  postQuickDrawAdvance,
  postQuickDrawGuessAdvance,
} from '@/lib/game-api'
import { HostChrome } from '@/components/host/HostChrome'
import { GameFinishedActions } from '@/components/lifecycle/GameFinishedActions'
import { DrawingPreview } from '@/components/quick-draw/DrawingCanvas'
import { LeaderboardPanel } from '@/components/ui/LeaderboardPanel'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useQuickDrawAutoAdvance } from '@/hooks/useQuickDrawAutoAdvance'
import { getSupabase } from '@/lib/supabase'
import {
  QUICK_DRAW_ASSIGNMENT_SELECT,
  QUICK_DRAW_DRAWING_SELECT,
  QUICK_DRAW_GUESS_GUESS_SELECT,
  QUICK_DRAW_GUESS_PLAYER_SELECT,
  QUICK_DRAW_GUESS_SESSION_SELECT,
  QUICK_DRAW_GUESS_WORD_SELECT,
  QUICK_DRAW_SESSION_SELECT,
  QUICK_DRAW_TITLE_SELECT,
  QUICK_DRAW_VOTE_SELECT,
  ROUND_SELECT,
} from '@/lib/supabase-selects'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  onReload: () => void
}

export function QuickDrawHostScreen({ gameCode, hostToken, game, players, onReload }: Props) {
  const isGuess = isQuickDrawGuessVariant(game.quick_draw_variant)
  const [rounds, setRounds] = useState<Round[]>([])
  const [guessSession, setGuessSession] = useState<QuickDrawGuessSession | null>(null)
  const [guessWords, setGuessWords] = useState<QuickDrawGuessWord[]>([])
  const [guessRows, setGuessRows] = useState<QuickDrawGuessPlayer[]>([])
  const [guesses, setGuesses] = useState<QuickDrawGuessGuess[]>([])
  const [lieSession, setLieSession] = useState<QuickDrawSession | null>(null)
  const [drawings, setDrawings] = useState<QuickDrawDrawing[]>([])
  const [titles, setTitles] = useState<QuickDrawTitle[]>([])
  const [votes, setVotes] = useState<QuickDrawVote[]>([])
  const [assignments, setAssignments] = useState<QuickDrawAssignment[]>([])
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const code = gameCode.toUpperCase()
    if (isGuess) {
      const [sessRes, wordRes, teamRes, guessRes] = await Promise.all([
        getSupabase().from('quick_draw_guess_sessions').select(QUICK_DRAW_GUESS_SESSION_SELECT).eq('game_id', code).maybeSingle(),
        getSupabase().from('quick_draw_guess_words').select(QUICK_DRAW_GUESS_WORD_SELECT).eq('game_id', code),
        getSupabase().from('quick_draw_guess_players').select(QUICK_DRAW_GUESS_PLAYER_SELECT).eq('game_id', code),
        getSupabase().from('quick_draw_guess_guesses').select(QUICK_DRAW_GUESS_GUESS_SELECT).eq('game_id', code).order('created_at', { ascending: false }).limit(20),
      ])
      if (!sessRes.error) setGuessSession((sessRes.data as QuickDrawGuessSession | null) ?? null)
      if (!wordRes.error) setGuessWords((wordRes.data as QuickDrawGuessWord[]) ?? [])
      if (!teamRes.error) setGuessRows((teamRes.data as QuickDrawGuessPlayer[]) ?? [])
      if (!guessRes.error) setGuesses((guessRes.data as QuickDrawGuessGuess[]) ?? [])
      return
    }

    const [roundsRes, sessRes, drwRes, ttlRes, voteRes, asgRes] = await Promise.all([
      getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', code).order('round_number'),
      getSupabase().from('quick_draw_sessions').select(QUICK_DRAW_SESSION_SELECT).eq('game_id', code).maybeSingle(),
      getSupabase().from('quick_draw_drawings').select(QUICK_DRAW_DRAWING_SELECT).eq('game_id', code),
      getSupabase().from('quick_draw_titles').select(QUICK_DRAW_TITLE_SELECT).eq('game_id', code),
      getSupabase().from('quick_draw_votes').select(QUICK_DRAW_VOTE_SELECT).eq('game_id', code),
      getSupabase().from('quick_draw_assignments').select(QUICK_DRAW_ASSIGNMENT_SELECT).eq('game_id', code),
    ])
    if (!roundsRes.error) setRounds((roundsRes.data as Round[]) ?? [])
    if (!sessRes.error) setLieSession((sessRes.data as QuickDrawSession | null) ?? null)
    if (!drwRes.error) setDrawings((drwRes.data as QuickDrawDrawing[]) ?? [])
    if (!ttlRes.error) setTitles((ttlRes.data as QuickDrawTitle[]) ?? [])
    if (!voteRes.error) setVotes((voteRes.data as QuickDrawVote[]) ?? [])
    if (!asgRes.error) setAssignments((asgRes.data as QuickDrawAssignment[]) ?? [])
  }, [gameCode, isGuess])

  useEffect(() => {
    void load()
    const supabase = getSupabase()
    const tables = isGuess
      ? ['quick_draw_guess_sessions', 'quick_draw_guess_words', 'quick_draw_guess_guesses']
      : ['quick_draw_sessions', 'quick_draw_drawings', 'quick_draw_titles', 'quick_draw_votes', 'rounds']
    const channel = supabase.channel(uniqueTopic(`host-qd-${gameCode}`))
    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `game_id=eq.${gameCode}` },
        () => void load()
      )
    }
    channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, isGuess, load])

  useQuickDrawAutoAdvance({
    gameCode,
    game,
    enabled: !isGuess && game.status === 'active',
    onSynced: () => void load(),
  })

  const currentRound = useMemo(() => {
    const active = rounds.find((r) => r.status === 'active') ?? null
    const byPointer = rounds.find((r) => r.round_number === game.current_round_number) ?? null
    return active ?? byPointer
  }, [rounds, game.current_round_number])

  const activeDrawing =
    !isGuess && currentRound && lieSession
      ? activeDrawingForSession(drawings, currentRound.id, players, lieSession.drawing_index)
      : null

  const lieLeaderboard = useMemo(
    () => tallyQuickDrawScores(titles, votes, drawings, players),
    [titles, votes, drawings, players]
  )

  const onAdvance = async () => {
    setActing(true)
    setError(null)
    try {
      if (isGuess) await postQuickDrawGuessAdvance(gameCode, hostToken)
      else await postQuickDrawAdvance(gameCode)
      await load()
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Advance failed')
    } finally {
      setActing(false)
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

  const activePlayers = players.filter((p) => !p.spectator)
  const guessStrokeData = normalizeStrokeData(guessSession?.current_stroke_data ?? emptyStrokeData())
  const guessDrawer = guessSession?.drawer_player_id
    ? playerDisplayName(guessSession.drawer_player_id, players)
    : 'Drawer'
  const guessCountdown =
    guessSession?.phase === 'turn' ? phaseDeadlineCountdown(guessSession.turn_deadline_at) : 0
  const lieCountdown = lieSession ? phaseDeadlineCountdown(lieSession.turn_deadline_at) : 0

  return (
    <HostChrome gameCode={gameCode} hostToken={hostToken} game={game} players={players} onReload={onReload}>
      <View style={styles.statsRow}>
        <Text style={styles.stat}>Players: {activePlayers.length}</Text>
        <Text style={styles.stat}>{isGuess ? 'Guess mode' : 'Drawful mode'}</Text>
      </View>

      {isGuess && guessSession && game.status === 'active' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Live turn</Text>
            <Text style={styles.cardTitle}>
              {guessSession.phase === 'break'
                ? 'Round break'
                : `${guessDrawer} is drawing`}
            </Text>
            {guessSession.current_word && guessSession.phase === 'turn' ? (
              <Text style={styles.secretWord}>Word: {guessSession.current_word}</Text>
            ) : null}
            {guessCountdown > 0 ? <TimerBadge seconds={guessCountdown} /> : null}
          </View>
          {guessSession.phase === 'turn' ? <DrawingPreview strokeData={guessStrokeData} /> : null}
          <Text style={styles.meta}>{guesses.length} recent guesses logged</Text>
        </>
      ) : null}

      {!isGuess && lieSession && game.status === 'active' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Phase</Text>
            <Text style={styles.cardTitle}>{lieSession.phase.replace(/_/g, ' ')}</Text>
            {currentRound ? (
              <Text style={styles.meta}>
                Round {currentRound.round_number}/{game.rounds_count ?? '?'}
                {activeDrawing ? ` · ${playerDisplayName(activeDrawing.player_id, players)}'s drawing` : ''}
              </Text>
            ) : null}
            {lieCountdown > 0 ? <TimerBadge seconds={lieCountdown} /> : null}
          </View>
          {activeDrawing ? <DrawingPreview strokeData={activeDrawing.stroke_data} /> : null}
          <LeaderboardPanel
            title="Leaderboard"
            rows={lieLeaderboard.map((row) => ({ id: row.id, name: row.name, score: row.score }))}
          />
        </>
      ) : null}

      {game.status === 'active' ? (
        <Pressable style={[styles.primaryBtn, acting && styles.btnDisabled]} disabled={acting} onPress={() => void onAdvance()}>
          {acting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Advance phase</Text>}
        </Pressable>
      ) : null}


      {game.status === 'active' ? (
        <Pressable style={[styles.secondaryBtn, acting && styles.btnDisabled]} disabled={acting} onPress={() => void onFinish()}>
          <Text style={styles.secondaryBtnText}>End game</Text>
        </Pressable>
      ) : null}

      {game.status === 'finished' ? (
        <>
          <Pressable style={[styles.primaryBtn, acting && styles.btnDisabled]} disabled={acting} onPress={() => void onPlayAgain()}>
            <Text style={styles.primaryBtnText}>Play again</Text>
          </Pressable>
          <GameFinishedActions gameCode={gameCode} gameType={game.game_type} gameTitle={game.title} />
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
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '700', textTransform: 'capitalize' },
  secretWord: { color: '#d1d5db', fontSize: 14 },
  meta: { color: '#9ca3af', fontSize: 14 },
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
