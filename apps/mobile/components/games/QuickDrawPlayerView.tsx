import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  type Game,
  type Player,
  type QuickDrawDrawingStrokeData,
  type QuickDrawGuessGuess,
  type QuickDrawGuessPlayer,
  type QuickDrawGuessSession,
  type QuickDrawGuessWord,
} from '@fateround/shared'
import { batch8GameLabel } from '@fateround/shared/batch-8-games'
import {
  clampQuickDrawNumTeams,
  clampQuickDrawPlayMode,
  computeQuickDrawGuessScores,
  isQuickDrawGuessResultsPhase,
  isQuickDrawGuessVariant,
  quickDrawGuessIndividualLeaderboard,
  quickDrawGuessWinningTeams,
  teamLabel,
  QUICK_DRAW_GUESS_MIN_PLAYERS_TEAM,
  QUICK_DRAW_GUESS_MIN_PLAYERS_INDIVIDUAL,
} from '@fateround/shared/quick-draw-guess'
import { playerIsViewer } from '@fateround/shared/viewers'
import { emptyStrokeData, normalizeStrokeData } from '@fateround/shared/quick-draw-strokes'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner, WaitingPanel } from '@/components/game/GameChrome'
import { QuickDrawLiePlayerView } from '@/components/games/QuickDrawLiePlayerView'
import { QuickDrawShareCard } from '@/components/games/QuickDrawShareCard'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { ReplayReadyRing } from '@/components/lifecycle/ReplayReadyRing'
import { ActivityFeed } from '@/components/party/ActivityFeed'
import { RoundBreakCard } from '@/components/party/RoundBreakCard'
import { TeamBadge } from '@/components/party/TeamBadge'
import { TeamPickerGrid } from '@/components/party/TeamPickerGrid'
import { TeamScoreGrid } from '@/components/party/TeamScoreGrid'
import { LiveDrawingCanvas } from '@/components/quick-draw/DrawingCanvas'
import { useHeaderBadge } from '@/components/session/HeaderBadgeContext'
import { KeyboardAwareGameScroll } from '@/components/ui/KeyboardAwareGameScroll'
import { LeaderboardPanel } from '@/components/ui/LeaderboardPanel'
import { DeadlineTimerBadge } from '@/components/ui/DeadlineTimerBadge'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import {
  postQuickDrawGuess,
  postQuickDrawGuessAdvance,
  postQuickDrawGuessExpireTurn,
  postQuickDrawGuessSkip,
  postQuickDrawGuessStrokes,
  postQuickDrawGuessTeam,
} from '@/lib/game-api'
import { useTurnExpiryTimer } from '@/hooks/useTurnExpiryTimer'
import { getSupabase } from '@/lib/supabase'
import {
  QUICK_DRAW_GUESS_GUESS_SELECT,
  QUICK_DRAW_GUESS_PLAYER_SELECT,
  QUICK_DRAW_GUESS_SESSION_SELECT,
  QUICK_DRAW_GUESS_WORD_SELECT,
} from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { scoreListLeaderboard, toLeaderboardRows } from '@/lib/finish-leaderboards'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

/** Team that plays turn `turnIndex` (mirrors web `teamForTurn`). */
const teamForTurn = (turnIndex: number, numTeams: number): number => (turnIndex % numTeams) + 1

/** Total turns in the match (mirrors web `quickDrawGuessTotalTurns`). */
const quickDrawGuessTotalTurns = (
  mode: 'team' | 'individual',
  numTeams: number,
  rosterLen: number,
  totalRounds: number
): number => (mode === 'individual' ? rosterLen : numTeams) * totalRounds

export function QuickDrawPlayerView({ gameCode }: { gameCode: string }) {
  const [session, setSession] = useState<QuickDrawGuessSession | null>(null)
  const [teamRows, setTeamRows] = useState<QuickDrawGuessPlayer[]>([])
  const [words, setWords] = useState<QuickDrawGuessWord[]>([])
  const [guesses, setGuesses] = useState<QuickDrawGuessGuess[]>([])
  const [guessText, setGuessText] = useState('')
  const [acting, setActing] = useState(false)
  // Disabled while a stroke is in progress so drawing on the canvas doesn't
  // scroll the page (the native scroll gesture otherwise steals the drag).
  const [scrollEnabled, setScrollEnabled] = useState(true)
  const scrollRef = useRef<ScrollView>(null)
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  const loadGameState = useCallback(
    async (game: Game, _players: Player[]): Promise<{ state: QuickDrawGuessSession | null; ok: boolean }> => {
      if (!isQuickDrawGuessVariant(game.quick_draw_variant)) {
        return { state: null, ok: true }
      }
      const code = gameCode.toUpperCase()
      const [sessionRes, teamRes, wordRes, guessRes] = await Promise.all([
        getSupabase()
          .from('quick_draw_guess_sessions')
          .select(QUICK_DRAW_GUESS_SESSION_SELECT)
          .eq('game_id', code)
          .maybeSingle(),
        getSupabase()
          .from('quick_draw_guess_players')
          .select(QUICK_DRAW_GUESS_PLAYER_SELECT)
          .eq('game_id', code)
          .order('created_at'),
        getSupabase().from('quick_draw_guess_words').select(QUICK_DRAW_GUESS_WORD_SELECT).eq('game_id', code),
        getSupabase()
          .from('quick_draw_guess_guesses')
          .select(QUICK_DRAW_GUESS_GUESS_SELECT)
          .eq('game_id', code)
          .order('created_at', { ascending: false })
          .limit(40),
      ])
      if (sessionRes.error || teamRes.error || wordRes.error || guessRes.error) {
        return { state: null, ok: false }
      }
      const sessionData = sessionRes.data as QuickDrawGuessSession | null
      setSession(sessionData)
      setTeamRows((teamRes.data as QuickDrawGuessPlayer[]) ?? [])
      setWords((wordRes.data as QuickDrawGuessWord[]) ?? [])
      setGuesses((guessRes.data as QuickDrawGuessGuess[]) ?? [])
      return { state: sessionData, ok: true }
    },
    [gameCode]
  )

  const bootstrap = useGameViewBootstrap<Screen, QuickDrawGuessSession | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen: (game, playerId, sessionData) => {
      if (!isQuickDrawGuessVariant(game.quick_draw_variant)) return 'playing'
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      if (isQuickDrawGuessResultsPhase(game.status, sessionData)) return 'finished'
      if (game.status === 'active') return 'playing'
      return 'waiting'
    },
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      'quick_draw_guess_sessions',
      'quick_draw_guess_players',
      'quick_draw_guess_words',
      'quick_draw_guess_guesses',
    ],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const isGuessMode = isQuickDrawGuessVariant(bootstrap.game?.quick_draw_variant)

  const mode = clampQuickDrawPlayMode(bootstrap.game?.quick_draw_play_mode ?? session?.mode)
  const numTeams = clampQuickDrawNumTeams(bootstrap.game?.quick_draw_num_teams ?? session?.num_teams)
  // Surface the mode as a header pill on every screen (join, lobby, play) so
  // players see "Individual" / "N teams" up front — and the active team while a
  // team turn is in progress. Only in guess mode — the lie variant renders its
  // own view below.
  useHeaderBadge(
    isGuessMode && bootstrap.game
      ? mode === 'team'
        ? bootstrap.screen === 'playing' && session
          ? teamLabel(session.active_team)
          : `${numTeams} teams`
        : 'Individual'
      : null
  )
  const myTeamRow = teamRows.find((r) => r.player_id === bootstrap.myPlayerId)
  const isDrawer = session?.drawer_player_id === bootstrap.myPlayerId
  const onMyTeam = mode === 'individual' || myTeamRow?.team === session?.active_team
  const mePlayer = bootstrap.myPlayerId ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) : undefined
  const isViewer = !!(mePlayer && bootstrap.game && playerIsViewer(mePlayer, bootstrap.game))
  // Individual mode: once I've guessed the word correctly this turn, the guess box
  // is replaced by a "You got it!" note so I can't keep submitting (mirrors web
  // QuickDrawGuessPlay `myGuessedThisTurn`).
  const myGuessedThisTurn =
    mode === 'individual' &&
    !!session &&
    guesses.some((g) => g.turn_index === session.turn_index && g.player_id === bootstrap.myPlayerId && g.correct)
  const canGuess = session?.phase === 'turn' && !isDrawer && !isViewer && onMyTeam

  const act = async (fn: () => Promise<unknown>) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await fn()
      setGuessText('')
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  const teamCounts = useMemo(() => {
    const counts = new Array(numTeams + 1).fill(0)
    for (const row of teamRows) {
      if (row.team >= 1 && row.team <= numTeams) counts[row.team] += 1
    }
    return counts
  }, [teamRows, numTeams])

  const teamMembers = useMemo(() => {
    const map = new Map<number, string[]>()
    const nameById = new Map(bootstrap.players.map((p) => [p.id, p.name]))
    for (const row of teamRows) {
      if (row.team < 1) continue
      const list = map.get(row.team) ?? []
      list.push(nameById.get(row.player_id) ?? 'Player')
      map.set(row.team, list)
    }
    return map
  }, [teamRows, bootstrap.players])

  const liveTeamScores = useMemo(() => computeQuickDrawGuessScores(words, numTeams), [words, numTeams])

  const liveIndividualScores = useMemo(
    () => quickDrawGuessIndividualLeaderboard(teamRows, bootstrap.players),
    [teamRows, bootstrap.players]
  )

  const guessFeed = useMemo(() => {
    const nameById = new Map(bootstrap.players.map((p) => [p.id, p.name]))
    // Only show guesses from the CURRENT turn so stale guesses from earlier
    // words/turns don't bleed into the live feed (mirrors web GuessFeed).
    const turnIndex = session?.turn_index ?? -1
    return guesses
      .filter((g) => g.turn_index === turnIndex)
      .slice(0, 12)
      .map((g) => {
        // Individual mode masks other players' guess text so no one can copy a
        // correct answer — you only see 'guessing…' / 'guessed it ✅'. Mirrors web
        // GuessFeed hideOthersText (QuickDrawGuessPlay.tsx).
        const mask = mode === 'individual' && g.player_id !== bootstrap.myPlayerId
        const primary = mask ? (g.correct ? 'guessed it ✅' : 'guessing…') : g.text
        return {
          id: g.id,
          primary,
          secondary: `${nameById.get(g.player_id) ?? 'Player'}${g.correct ? ` · +${g.points}` : ''}`,
        }
      })
  }, [guesses, bootstrap.players, bootstrap.myPlayerId, mode, session?.turn_index])

  // Drive the guess game forward when a phase timer runs out — any active
  // non-viewer client fires (idempotent + deadline-gated server-side), matching
  // web. Without this an all-mobile guess table's turn/break hangs at 0.
  const canDriveTimers = isGuessMode && bootstrap.game?.status === 'active' && !isViewer
  useTurnExpiryTimer({
    deadlineAt: session?.phase === 'turn' ? session?.turn_deadline_at : null,
    enabled: canDriveTimers,
    onExpire: () => postQuickDrawGuessExpireTurn(bootstrap.code).then(() => bootstrap.load()),
  })
  useTurnExpiryTimer({
    deadlineAt: session?.phase === 'break' ? session?.break_deadline_at : null,
    enabled: canDriveTimers,
    onExpire: () => postQuickDrawGuessAdvance(bootstrap.code).then(() => bootstrap.load()),
  })

  const strokeData = normalizeStrokeData(session?.current_stroke_data ?? emptyStrokeData())
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncStrokes = useCallback(
    (data: QuickDrawDrawingStrokeData) => {
      if (!bootstrap.myResumeToken || !isDrawer) return
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      syncTimerRef.current = setTimeout(() => {
        void postQuickDrawGuessStrokes(bootstrap.code, bootstrap.myResumeToken!, data)
      }, 400)
    },
    [bootstrap.code, bootstrap.myResumeToken, isDrawer]
  )

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  }, [])

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />

  if (!isGuessMode && bootstrap.game) {
    return <QuickDrawLiePlayerView gameCode={gameCode} />
  }

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
    // (readiness = holding a seat), using quick-draw's own min-player thresholds.
    if (bootstrap.game.replay_pending) {
      return (
        <GameShell bootstrap={bootstrap} title={batch8GameLabel('quick_draw')}>
          <ReplayReadyRing
            gameCode={bootstrap.code}
            players={bootstrap.players}
            myPlayerId={bootstrap.myPlayerId}
            myResumeToken={bootstrap.myResumeToken ?? null}
            minPlayers={
              mode === 'individual' ? QUICK_DRAW_GUESS_MIN_PLAYERS_INDIVIDUAL : QUICK_DRAW_GUESS_MIN_PLAYERS_TEAM
            }
            onReload={() => bootstrap.load()}
          />
        </GameShell>
      )
    }
    if (mode === 'individual') {
      return <LobbyView {...lobbyProps!} onLeft={onLeft} />
    }
    return (
      <GameShell bootstrap={bootstrap} title={batch8GameLabel('quick_draw')} subtitle="Pick your team">
        <TeamPickerGrid
          numTeams={numTeams}
          myTeam={myTeamRow?.team}
          teamCounts={teamCounts}
          teamMembers={teamMembers}
          onPickTeam={(team) => void act(() => postQuickDrawGuessTeam(bootstrap.code, bootstrap.myResumeToken!, team))}
          acting={acting}
          help="Choose a team before the host starts."
        />
      </GameShell>
    )
  }

  if (bootstrap.screen === 'finished' && bootstrap.game) {
    if (mode === 'individual') {
      const board = quickDrawGuessIndividualLeaderboard(teamRows, bootstrap.players)
      const top = board[0]
      const hasWinner = !!top && top.score > 0
      return (
        <GameFinishPanel
          bootstrap={bootstrap}
          emoji={hasWinner ? '🏆' : '🏁'}
          title={hasWinner ? `${top.name} wins!` : 'Final results'}
          subtitle="Final standings"
          winnerPlayerId={hasWinner ? top.id : null}
          roundKey={session?.id ?? null}
          notice={
            <QuickDrawShareCard mode="individual" board={board} highlightPlayerId={bootstrap.myPlayerId} hideHeader />
          }
        />
      )
    }
    const scores = computeQuickDrawGuessScores(words, numTeams)
    const winners = quickDrawGuessWinningTeams(scores)
    const winnerLabel = winners.map((t) => teamLabel(t)).join(' & ')
    // Fun end-of-match stat: who guessed the most words (mirrors web share card).
    const guessCounts = new Map<string, number>()
    for (const w of words) {
      if (w.status === 'guessed' && w.guesser_player_id) {
        guessCounts.set(w.guesser_player_id, (guessCounts.get(w.guesser_player_id) ?? 0) + 1)
      }
    }
    const nameById = new Map(bootstrap.players.map((p) => [p.id, p.name]))
    const topGuessers = [...guessCounts.entries()]
      .map(([id, count]) => ({ name: nameById.get(id) ?? 'Player', count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
    return (
      <GameFinishPanel
        bootstrap={bootstrap}
        emoji={winners.length > 0 ? '🏆' : '🏁'}
        title="Final results"
        subtitle="Team scores"
        detail={winnerLabel ? `${winnerLabel} wins` : undefined}
        notice={
          <QuickDrawShareCard mode="team" teamScores={scores} winners={winners} topGuessers={topGuessers} hideHeader />
        }
      />
    )
  }

  if (!bootstrap.game || !session) return <GameLoading />

  const drawerName = bootstrap.players.find((p) => p.id === session.drawer_player_id)?.name ?? 'Drawer'
  const statusText =
    session.phase === 'break'
      ? 'Round break'
      : isDrawer
        ? 'You are drawing'
        : canGuess
          ? 'Guess the word!'
          : `${drawerName} is drawing`

  // Break card next-up hint: the final turn tips into results; otherwise the next
  // team (team mode) or next drawer (individual) is up (mirrors web break card).
  const totalTurns = quickDrawGuessTotalTurns(mode, numTeams, teamRows.length, session.total_rounds)
  const isLastTurn = session.turn_index + 1 >= totalTurns
  const breakDetail = isLastTurn
    ? 'Final results next'
    : mode === 'individual'
      ? 'Next drawer up'
      : `Next up: ${teamLabel(teamForTurn(session.turn_index + 1, numTeams))}`

  return (
    <GameShell
      title={batch8GameLabel('quick_draw')}
      gameCode={bootstrap.code}
      game={bootstrap.game}
      players={bootstrap.players}
      myPlayerId={bootstrap.myPlayerId}
      onPromoted={() => bootstrap.load()}
    >
      <KeyboardAwareGameScroll ref={scrollRef} contentContainerStyle={styles.content} scrollEnabled={scrollEnabled}>
        <TurnBanner text={statusText} isMyTurn={isDrawer || canGuess} />

        {mode === 'team' && myTeamRow?.team ? (
          <View style={styles.teamRow}>
            <Text style={styles.teamRowLabel}>You're on</Text>
            <TeamBadge team={myTeamRow.team} />
          </View>
        ) : null}

        <DeadlineTimerBadge deadlineAt={session?.turn_deadline_at} active={session.phase === 'turn'} />

        {mode === 'team' ? (
          <TeamScoreGrid
            scores={liveTeamScores}
            activeTeam={session.phase === 'turn' ? session.active_team : null}
            myTeam={myTeamRow?.team}
            round={session.current_round}
            totalRounds={session.total_rounds}
          />
        ) : (
          <LeaderboardPanel
            embedded
            title="Leaderboard"
            rows={liveIndividualScores.map((row) => ({
              id: row.id,
              name: row.name,
              score: row.score,
              highlight: row.id === bootstrap.myPlayerId,
            }))}
            highlightId={bootstrap.myPlayerId}
          />
        )}

        {session.phase === 'break' ? (
          <RoundBreakCard
            title={isLastTurn ? 'Last turn done' : 'Round break'}
            message={session.status_message ?? 'Next turn starting soon…'}
            deadlineAt={session?.break_deadline_at}
            active={session.phase === 'break'}
            detail={breakDetail}
          />
        ) : null}

        {session.status_message && session.phase !== 'break' ? (
          <Text style={styles.status}>{session.status_message}</Text>
        ) : null}

        {session.phase === 'turn' ? (
          isDrawer && session.current_word ? (
            <LiveDrawingCanvas
              prompt={session.current_word}
              resetKey={`${session.turn_index}-${session.current_word}`}
              onStrokeChange={syncStrokes}
              onDrawActiveChange={(active) => setScrollEnabled(!active)}
              // Skip-word only exists in team mode (a team races through many
              // words per turn); individual mode has one word per turn. Mirrors
              // web QuickDrawGuessPlay's `!isIndividual` gate.
              onSkip={
                mode === 'team'
                  ? () => void act(() => postQuickDrawGuessSkip(bootstrap.code, bootstrap.myResumeToken!))
                  : undefined
              }
              skipDisabled={acting}
            />
          ) : (
            <LiveDrawingCanvas strokeData={strokeData} readOnly resetKey={`${session.turn_index}-watch`} />
          )
        ) : null}

        {canGuess && myGuessedThisTurn ? (
          <Text style={styles.gotIt}>You got it! ✅</Text>
        ) : canGuess ? (
          <View style={styles.guessBox}>
            <TextInput
              style={styles.input}
              value={guessText}
              onChangeText={setGuessText}
              placeholder="Type your guess"
              placeholderTextColor={theme.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={80}
              onFocus={() => {
                // Lift the guess box above the software keyboard — the input sits
                // near the bottom of the scroll, so scroll it into view on focus.
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)
              }}
              onSubmitEditing={() =>
                guessText.trim() &&
                void act(() => postQuickDrawGuess(bootstrap.code, bootstrap.myResumeToken!, guessText.trim()))
              }
            />
            <Pressable
              style={[styles.primaryBtn, acting && styles.btnDisabled]}
              disabled={acting || !guessText.trim()}
              onPress={() =>
                void act(() => postQuickDrawGuess(bootstrap.code, bootstrap.myResumeToken!, guessText.trim()))
              }
            >
              <Text style={styles.primaryBtnText}>Guess</Text>
            </Pressable>
          </View>
        ) : null}

        <ActivityFeed embedded title="Recent guesses" items={guessFeed} emptyText="No guesses yet" />
      </KeyboardAwareGameScroll>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    teamRowLabel: { color: theme.textMuted, fontSize: 14 },
    content: { paddingBottom: 32, gap: 12 },
    status: { color: theme.textSecondary, fontSize: 14 },
    // emerald success — kept consistent across themes for the "you got it" note
    gotIt: { color: '#10b981', fontSize: 15, fontWeight: '700', textAlign: 'center' },
    wordBox: { backgroundColor: theme.surface, borderRadius: 12, padding: 16, gap: 8, alignItems: 'center' },
    wordLabel: { color: theme.textMuted, fontSize: 12, textTransform: 'uppercase' },
    word: { color: theme.text, fontSize: 32, fontWeight: '800', textAlign: 'center' },
    wordHint: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
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
    secondaryBtn: {
      backgroundColor: theme.border,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    secondaryBtnText: { color: theme.text, fontWeight: '600', fontSize: 15 },
    btnDisabled: { opacity: 0.5 },
  })
