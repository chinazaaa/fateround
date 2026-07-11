import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type {
  Game,
  Player,
  QuickDrawAssignment,
  QuickDrawDrawing,
  QuickDrawDrawingStrokeData,
  QuickDrawSession,
  QuickDrawTitle,
  QuickDrawVote,
  Round,
} from '@fateround/shared'
import { batch8GameLabel } from '@fateround/shared/batch-8-games'
import {
  QUICK_DRAW_MAX_TITLE_LENGTH,
  activeDrawingForSession,
  assignmentForPlayer,
  canPlayerSubmitFakeTitle,
  canPlayerVoteOnDrawing,
  phaseDeadlineCountdown,
  playerDisplayName,
  playerIsDrawingArtist,
  shuffledTitleOptions,
  tallyQuickDrawScores,
  titlesForDrawing,
  votesForDrawing,
} from '@fateround/shared/quick-draw-lie'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { DrawingCanvas, DrawingPreview } from '@/components/quick-draw/DrawingCanvas'
import { LeaderboardPanel } from '@/components/ui/LeaderboardPanel'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useQuickDrawAutoAdvance } from '@/hooks/useQuickDrawAutoAdvance'
import { postQuickDrawDraw, postQuickDrawTitle, postQuickDrawVote } from '@/lib/game-api'
import { scoreListLeaderboard } from '@/lib/finish-leaderboards'
import { getSupabase } from '@/lib/supabase'
import {
  QUICK_DRAW_ASSIGNMENT_SELECT,
  QUICK_DRAW_DRAWING_SELECT,
  QUICK_DRAW_SESSION_SELECT,
  QUICK_DRAW_TITLE_SELECT,
  QUICK_DRAW_VOTE_SELECT,
  ROUND_SELECT,
} from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

type LieState = {
  rounds: Round[]
  session: QuickDrawSession | null
  assignments: QuickDrawAssignment[]
  drawings: QuickDrawDrawing[]
  titles: QuickDrawTitle[]
  votes: QuickDrawVote[]
}

export function QuickDrawLiePlayerView({ gameCode }: { gameCode: string }) {
  const [state, setState] = useState<LieState>({
    rounds: [],
    session: null,
    assignments: [],
    drawings: [],
    titles: [],
    votes: [],
  })
  const [titleText, setTitleText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const advancedDeadlineRef = useRef<string | null>(null)

  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    const code = gameCode.toUpperCase()
    const [roundsRes, sessRes, asgRes, drwRes, ttlRes, voteRes] = await Promise.all([
      getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', code).order('round_number'),
      getSupabase().from('quick_draw_sessions').select(QUICK_DRAW_SESSION_SELECT).eq('game_id', code).maybeSingle(),
      getSupabase().from('quick_draw_assignments').select(QUICK_DRAW_ASSIGNMENT_SELECT).eq('game_id', code),
      getSupabase().from('quick_draw_drawings').select(QUICK_DRAW_DRAWING_SELECT).eq('game_id', code),
      getSupabase().from('quick_draw_titles').select(QUICK_DRAW_TITLE_SELECT).eq('game_id', code),
      getSupabase().from('quick_draw_votes').select(QUICK_DRAW_VOTE_SELECT).eq('game_id', code),
    ])
    if (roundsRes.error || sessRes.error) return { state: null, ok: false }
    setState({
      rounds: (roundsRes.data as Round[]) ?? [],
      session: (sessRes.data as QuickDrawSession | null) ?? null,
      assignments: (asgRes.data as QuickDrawAssignment[]) ?? [],
      drawings: (drwRes.data as QuickDrawDrawing[]) ?? [],
      titles: (ttlRes.data as QuickDrawTitle[]) ?? [],
      votes: (voteRes.data as QuickDrawVote[]) ?? [],
    })
    return { state: null, ok: true }
  }, [gameCode])

  const bootstrap = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen: (game, playerId) => {
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'finished') return 'finished'
      return 'playing'
    },
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      'rounds',
      'quick_draw_sessions',
      'quick_draw_assignments',
      'quick_draw_drawings',
      'quick_draw_titles',
      'quick_draw_votes',
    ],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  useQuickDrawAutoAdvance({
    gameCode: bootstrap.code,
    game: bootstrap.game,
    enabled: bootstrap.screen === 'playing',
    onSynced: () => void bootstrap.load(),
  })

  const currentRound = useMemo(() => {
    const byPointer = state.rounds.find((r) => r.round_number === bootstrap.game?.current_round_number) ?? null
    const active = state.rounds.find((r) => r.status === 'active') ?? null
    return active ?? byPointer
  }, [state.rounds, bootstrap.game?.current_round_number])

  const session = state.session
  const myAssignment = currentRound
    ? assignmentForPlayer(state.assignments, currentRound.id, bootstrap.myPlayerId ?? '')
    : null
  const roundDrawings = currentRound
    ? state.drawings.filter((d) => d.round_id === currentRound.id)
    : []
  const myDrawing = roundDrawings.find((d) => d.player_id === bootstrap.myPlayerId) ?? null
  const activeDrawing = currentRound && session
    ? activeDrawingForSession(state.drawings, currentRound.id, bootstrap.players, session.drawing_index)
    : null
  const activeTitles = activeDrawing ? titlesForDrawing(state.titles, activeDrawing.id) : []
  const shuffledTitles = useMemo(() => shuffledTitleOptions(activeTitles), [activeTitles])
  const activeVotes = activeDrawing ? votesForDrawing(state.votes, activeDrawing.id) : []
  const myTitle = activeTitles.find((t) => t.player_id === bootstrap.myPlayerId && !t.is_real) ?? null
  const myVote = activeVotes.find((v) => v.player_id === bootstrap.myPlayerId) ?? null
  const isArtist = playerIsDrawingArtist(activeDrawing, bootstrap.myPlayerId ?? '')
  const canSubmitTitle = canPlayerSubmitFakeTitle(activeDrawing, bootstrap.myPlayerId ?? '')
  const canVote = canPlayerVoteOnDrawing(activeDrawing, bootstrap.myPlayerId ?? '')
  const leaderboard = tallyQuickDrawScores(state.titles, state.votes, state.drawings, bootstrap.players)

  const countdown = session?.turn_deadline_at ? phaseDeadlineCountdown(session.turn_deadline_at) : 0

  useEffect(() => {
    if (!session?.turn_deadline_at || countdown > 0 || bootstrap.game?.status !== 'active') return
    const key = `${session.phase}:${session.drawing_index}:${session.turn_deadline_at}`
    if (advancedDeadlineRef.current === key) return
    advancedDeadlineRef.current = key
    void bootstrap.load()
  }, [countdown, session, bootstrap])

  const act = async (fn: () => Promise<unknown>) => {
    if (!bootstrap.myResumeToken || submitting) return
    setSubmitting(true)
    try {
      await fn()
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
  if (bootstrap.screen === 'finished' && bootstrap.game) {
    const top = leaderboard[0]
    return (
      <GameFinishPanel
        bootstrap={bootstrap}
        title="Drawful results"
        subtitle="Final standings"
        detail={top ? `${top.name} — ${top.score} pts` : undefined}
        leaderboard={scoreListLeaderboard(leaderboard.map((r) => ({ name: r.name, score: r.score })))}
      />
    )
  }
  if (!bootstrap.game || !session || !currentRound) return <GameLoading />

  const phaseLabel =
    session.phase === 'drawing'
      ? 'Draw'
      : session.phase === 'titling'
        ? 'Fake titles'
        : session.phase === 'voting'
          ? 'Vote'
          : session.phase === 'reveal'
            ? 'Reveal'
            : 'Round'

  const artistName = activeDrawing ? playerDisplayName(activeDrawing.player_id, bootstrap.players) : 'Someone'

  return (
    <GameShell bootstrap={bootstrap} title={batch8GameLabel('quick_draw')} subtitle="Drawful">
      <ScrollView contentContainerStyle={styles.content}>
        <TurnBanner
          text={`${phaseLabel} · Round ${currentRound.round_number}/${bootstrap.game.rounds_count ?? '?'}`}
          isMyTurn={
            (session.phase === 'drawing' && !!myAssignment && !myDrawing) ||
            (session.phase === 'titling' && canSubmitTitle && !myTitle) ||
            (session.phase === 'voting' && canVote && !myVote)
          }
        />

        {countdown > 0 && session.phase !== 'reveal' ? <TimerBadge seconds={countdown} /> : null}

        <LeaderboardPanel
          title="Leaderboard"
          rows={leaderboard.map((row) => ({
            id: row.id,
            name: row.name,
            score: row.score,
            highlight: row.id === bootstrap.myPlayerId,
          }))}
          highlightId={bootstrap.myPlayerId}
        />

        {session.phase !== 'drawing' && activeDrawing ? (
          <Text style={styles.sub}>Drawing by {artistName}</Text>
        ) : null}

        {session.phase === 'drawing' && myAssignment && !myDrawing ? (
          <DrawingCanvas
            prompt={myAssignment.prompt}
            submitting={submitting}
            onSubmit={(strokeData: QuickDrawDrawingStrokeData) =>
              act(() =>
                postQuickDrawDraw(bootstrap.code, bootstrap.myResumeToken!, currentRound.id, strokeData)
              )
            }
          />
        ) : null}

        {session.phase === 'drawing' && myDrawing ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Drawing submitted ✅</Text>
            <DrawingPreview strokeData={myDrawing.stroke_data} />
          </View>
        ) : null}

        {session.phase === 'drawing' && !myAssignment ? (
          <Text style={styles.sub}>Waiting for artists to finish drawing…</Text>
        ) : null}

        {session.phase === 'titling' && activeDrawing ? (
          <>
            <DrawingPreview strokeData={activeDrawing.stroke_data} />
            {isArtist ? (
              <Text style={styles.sub}>Others are writing fake titles for your drawing.</Text>
            ) : canSubmitTitle && !myTitle ? (
              <View style={styles.guessBox}>
                <TextInput
                  style={styles.input}
                  value={titleText}
                  onChangeText={setTitleText}
                  placeholder="Write a convincing fake title"
                  placeholderTextColor="#6b7280"
                  maxLength={QUICK_DRAW_MAX_TITLE_LENGTH}
                />
                <Pressable
                  style={[styles.primaryBtn, submitting && styles.btnDisabled]}
                  disabled={submitting || !titleText.trim()}
                  onPress={() =>
                    void act(async () => {
                      await postQuickDrawTitle(
                        bootstrap.code,
                        bootstrap.myResumeToken!,
                        activeDrawing.id,
                        titleText.trim()
                      )
                      setTitleText('')
                    })
                  }
                >
                  <Text style={styles.primaryBtnText}>Submit title</Text>
                </Pressable>
              </View>
            ) : myTitle ? (
              <Text style={styles.sub}>Title submitted — waiting for votes.</Text>
            ) : null}
          </>
        ) : null}

        {session.phase === 'voting' && activeDrawing && canVote && !myVote ? (
          <>
            <DrawingPreview strokeData={activeDrawing.stroke_data} />
            <Text style={styles.sub}>Pick the real title</Text>
            {shuffledTitles.map((title) => (
              <Pressable
                key={title.id}
                style={styles.titleBtn}
                disabled={submitting}
                onPress={() =>
                  void act(() =>
                    postQuickDrawVote(bootstrap.code, bootstrap.myResumeToken!, activeDrawing.id, title.id)
                  )
                }
              >
                <Text style={styles.titleBtnText}>{title.text}</Text>
              </Pressable>
            ))}
          </>
        ) : null}

        {session.phase === 'voting' && myVote ? (
          <Text style={styles.sub}>Vote locked in — waiting for others.</Text>
        ) : null}

        {session.phase === 'reveal' && activeDrawing ? (
          <>
            <DrawingPreview strokeData={activeDrawing.stroke_data} />
            {activeTitles.map((title) => {
              const votes = activeVotes.filter((v) => v.chosen_title_id === title.id).length
              return (
                <View key={title.id} style={styles.revealRow}>
                  <Text style={styles.titleBtnText}>{title.text}</Text>
                  <Text style={styles.revealMeta}>
                    {title.is_real ? 'Real title' : 'Fake'} · {votes} vote{votes === 1 ? '' : 's'}
                  </Text>
                </View>
              )
            })}
          </>
        ) : null}
      </ScrollView>
    </GameShell>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32, gap: 12 },
  sub: { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
  card: { backgroundColor: '#17171d', borderRadius: 12, padding: 16, gap: 10 },
  cardTitle: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  guessBox: { gap: 10 },
  input: {
    backgroundColor: '#17171d',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryBtn: {
    backgroundColor: '#f43f5e',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  titleBtn: {
    backgroundColor: '#17171d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a35',
    padding: 14,
  },
  titleBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  revealRow: {
    backgroundColor: '#17171d',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  revealMeta: { color: '#9ca3af', fontSize: 13 },
})
