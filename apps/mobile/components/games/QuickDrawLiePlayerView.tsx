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
  QUICK_DRAW_MIN_PLAYERS,
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
import { playerIsViewer } from '@fateround/shared/viewers'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { ReplayReadyRing } from '@/components/lifecycle/ReplayReadyRing'
import { DrawingCanvas, DrawingPreview } from '@/components/quick-draw/DrawingCanvas'
import { KeyboardAwareGameScroll } from '@/components/ui/KeyboardAwareGameScroll'
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
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

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
  // Disabled while a stroke is in progress so drawing doesn't scroll the page.
  const [scrollEnabled, setScrollEnabled] = useState(true)
  const advancedDeadlineRef = useRef<string | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

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
  const roundDrawings = currentRound ? state.drawings.filter((d) => d.round_id === currentRound.id) : []
  const myDrawing = roundDrawings.find((d) => d.player_id === bootstrap.myPlayerId) ?? null
  const activeDrawing =
    currentRound && session
      ? activeDrawingForSession(state.drawings, currentRound.id, bootstrap.players, session.drawing_index)
      : null
  const activeTitles = activeDrawing ? titlesForDrawing(state.titles, activeDrawing.id) : []
  const shuffledTitles = useMemo(() => shuffledTitleOptions(activeTitles), [activeTitles])
  const activeVotes = activeDrawing ? votesForDrawing(state.votes, activeDrawing.id) : []
  const myTitle = activeTitles.find((t) => t.player_id === bootstrap.myPlayerId && !t.is_real) ?? null
  const myVote = activeVotes.find((v) => v.player_id === bootstrap.myPlayerId) ?? null
  const isArtist = playerIsDrawingArtist(activeDrawing, bootstrap.myPlayerId ?? '')
  const mePlayer = bootstrap.myPlayerId ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) : undefined
  // Late-joiners / spectators watch only — they can't title or vote (mirrors web
  // QuickDrawActiveRound `cannotParticipate`).
  const isViewer = !!(mePlayer && bootstrap.game && playerIsViewer(mePlayer, bootstrap.game))
  const cannotParticipate = isViewer || mePlayer?.spectator === true || mePlayer?.is_eliminated === true
  const canSubmitTitle = canPlayerSubmitFakeTitle(activeDrawing, bootstrap.myPlayerId ?? '', {
    readOnly: cannotParticipate,
  })
  const canVote = canPlayerVoteOnDrawing(activeDrawing, bootstrap.myPlayerId ?? '', { readOnly: cannotParticipate })
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
    // "Play again · same settings" reopened the lobby with the ready-up ring
    // (readiness = holding a seat).
    if (bootstrap.game.replay_pending) {
      return (
        <GameShell bootstrap={bootstrap} title={batch8GameLabel('quick_draw')}>
          <ReplayReadyRing
            gameCode={bootstrap.code}
            players={bootstrap.players}
            myPlayerId={bootstrap.myPlayerId}
            myResumeToken={bootstrap.myResumeToken ?? null}
            minPlayers={QUICK_DRAW_MIN_PLAYERS}
            onReload={() => bootstrap.load()}
          />
        </GameShell>
      )
    }
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (bootstrap.screen === 'finished' && bootstrap.game) {
    const top = leaderboard[0]
    const hasWinner = !!top && top.score > 0
    return (
      <GameFinishPanel
        bootstrap={bootstrap}
        emoji={hasWinner ? '🏆' : '🏁'}
        title={hasWinner ? `${top.name} wins!` : 'Drawful results'}
        subtitle="Final standings"
        detail={top ? `${top.name} — ${top.score} pts` : undefined}
        leaderboard={scoreListLeaderboard(leaderboard.map((r) => ({ name: r.name, score: r.score })))}
        winnerPlayerId={hasWinner ? top.id : null}
        roundKey={session?.id ?? null}
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

  // Within-round progress: which drawing (of this round's set) is being titled/
  // voted/revealed (mirrors web 'Drawing X of Y').
  const drawingProgress =
    session.phase !== 'drawing' && activeDrawing && roundDrawings.length > 0
      ? ` · Drawing ${session.drawing_index + 1}/${roundDrawings.length}`
      : ''

  return (
    <GameShell
      title={batch8GameLabel('quick_draw')}
      subtitle="Drawful"
      gameCode={bootstrap.code}
      game={bootstrap.game}
      players={bootstrap.players}
      myPlayerId={bootstrap.myPlayerId}
      onPromoted={() => bootstrap.load()}
    >
      <KeyboardAwareGameScroll ref={scrollRef} contentContainerStyle={styles.content} scrollEnabled={scrollEnabled}>
        <TurnBanner
          text={`${phaseLabel} · Round ${currentRound.round_number}/${bootstrap.game.rounds_count ?? '?'}${drawingProgress}`}
          isMyTurn={
            (session.phase === 'drawing' && !!myAssignment && !myDrawing) ||
            (session.phase === 'titling' && canSubmitTitle && !myTitle) ||
            (session.phase === 'voting' && canVote && !myVote)
          }
        />

        {countdown > 0 && session.phase !== 'reveal' ? <TimerBadge seconds={countdown} /> : null}

        <LeaderboardPanel
          embedded
          title="Leaderboard"
          rows={leaderboard.map((row) => ({
            id: row.id,
            name: row.name,
            score: row.score,
            highlight: row.id === bootstrap.myPlayerId,
          }))}
          highlightId={bootstrap.myPlayerId}
        />

        {session.phase !== 'drawing' && activeDrawing ? <Text style={styles.sub}>Drawing by {artistName}</Text> : null}

        {session.phase === 'drawing' && myAssignment && !myDrawing ? (
          <DrawingCanvas
            prompt={myAssignment.prompt}
            submitting={submitting}
            onDrawActiveChange={(active) => setScrollEnabled(!active)}
            onSubmit={(strokeData: QuickDrawDrawingStrokeData) =>
              act(() => postQuickDrawDraw(bootstrap.code, bootstrap.myResumeToken!, currentRound.id, strokeData))
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
                  placeholderTextColor={theme.textFaint}
                  maxLength={QUICK_DRAW_MAX_TITLE_LENGTH}
                  onFocus={() => {
                    // Lift the input above the software keyboard on focus.
                    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)
                  }}
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

        {session.phase === 'voting' && activeDrawing ? (
          <>
            <DrawingPreview strokeData={activeDrawing.stroke_data} />
            <Text style={styles.sub}>
              {myVote
                ? 'Vote locked in — waiting for others.'
                : isArtist
                  ? 'This is your drawing — sit tight.'
                  : cannotParticipate
                    ? 'Watching this vote.'
                    : 'Pick the real title'}
            </Text>
            {/* Options stay on screen after voting, numbered, with your pick
                highlighted (mirrors web QuickDrawActiveRound voting grid). */}
            {shuffledTitles.map((title, index) => {
              const isPicked = myVote?.chosen_title_id === title.id
              const canTap = canVote && !myVote && !submitting
              return (
                <Pressable
                  key={title.id}
                  style={[styles.titleBtn, isPicked && styles.titleBtnPicked]}
                  disabled={!canTap}
                  onPress={() =>
                    void act(() =>
                      postQuickDrawVote(bootstrap.code, bootstrap.myResumeToken!, activeDrawing.id, title.id)
                    )
                  }
                >
                  <Text style={styles.optionLabel}>Option {index + 1}</Text>
                  <Text style={styles.titleBtnText}>{title.text}</Text>
                  {isPicked ? <Text style={styles.yourPick}>Your pick</Text> : null}
                </Pressable>
              )
            })}
          </>
        ) : null}

        {session.phase === 'reveal' && activeDrawing ? (
          <>
            <DrawingPreview strokeData={activeDrawing.stroke_data} />
            {/* Author attribution + points + real-title highlight (mirrors web
                QuickDrawActiveRound reveal block). */}
            {shuffledTitles.map((title) => {
              const votes = activeVotes.filter((v) => v.chosen_title_id === title.id).length
              const author = title.is_real
                ? `${artistName} (real prompt)`
                : title.player_id
                  ? playerDisplayName(title.player_id, bootstrap.players)
                  : 'Unknown'
              return (
                <View key={title.id} style={[styles.revealRow, title.is_real && styles.revealRowReal]}>
                  <Text style={styles.titleBtnText}>{title.text}</Text>
                  <Text style={styles.revealMeta}>
                    {title.is_real ? '✓ Real title' : `Fake by ${author}`} · {votes} vote{votes === 1 ? '' : 's'}
                  </Text>
                  {votes > 0 ? <Text style={styles.revealPoints}>+{votes} pts</Text> : null}
                </View>
              )
            })}
          </>
        ) : null}
      </KeyboardAwareGameScroll>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { paddingBottom: 32, gap: 12 },
    sub: { color: theme.textMuted, fontSize: 14, textAlign: 'center' },
    card: { backgroundColor: theme.surface, borderRadius: 12, padding: 16, gap: 10 },
    cardTitle: { color: theme.text, fontWeight: '700', textAlign: 'center' },
    guessBox: { gap: 10 },
    input: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 12,
      color: theme.text,
      fontSize: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
    },
    // white on the solid rose button — intentional
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    btnDisabled: { opacity: 0.5 },
    titleBtn: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.border,
      padding: 14,
      gap: 2,
    },
    titleBtnPicked: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    optionLabel: { color: theme.textFaint, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    titleBtnText: { color: theme.text, fontSize: 16, fontWeight: '600' },
    yourPick: { color: theme.primary, fontSize: 12, fontWeight: '700', marginTop: 2 },
    revealRow: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.border,
      padding: 12,
      gap: 4,
    },
    // emerald highlight for the correct answer — consistent across themes
    revealRowReal: { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.12)' },
    revealMeta: { color: theme.textMuted, fontSize: 13 },
    revealPoints: { color: '#10b981', fontSize: 13, fontWeight: '700' },
  })
