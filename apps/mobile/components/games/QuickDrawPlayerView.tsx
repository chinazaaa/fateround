import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { type Game, type Player, type QuickDrawDrawingStrokeData, type QuickDrawGuessGuess, type QuickDrawGuessPlayer, type QuickDrawGuessSession, type QuickDrawGuessWord } from '@fateround/shared'
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
} from '@fateround/shared/quick-draw-guess'
import { emptyStrokeData, normalizeStrokeData } from '@fateround/shared/quick-draw-strokes'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner, WaitingPanel } from '@/components/game/GameChrome'
import { QuickDrawLiePlayerView } from '@/components/games/QuickDrawLiePlayerView'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { ActivityFeed } from '@/components/party/ActivityFeed'
import { RoundBreakCard } from '@/components/party/RoundBreakCard'
import { TeamBadge } from '@/components/party/TeamBadge'
import { TeamPickerGrid } from '@/components/party/TeamPickerGrid'
import { TeamScoreGrid } from '@/components/party/TeamScoreGrid'
import { useAbsoluteDeadline } from '@/components/party/useAbsoluteDeadline'
import { LiveDrawingCanvas } from '@/components/quick-draw/DrawingCanvas'
import { LeaderboardPanel } from '@/components/ui/LeaderboardPanel'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postQuickDrawGuess, postQuickDrawGuessSkip, postQuickDrawGuessStrokes, postQuickDrawGuessTeam } from '@/lib/game-api'
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

export function QuickDrawPlayerView({ gameCode }: { gameCode: string }) {
  const [session, setSession] = useState<QuickDrawGuessSession | null>(null)
  const [teamRows, setTeamRows] = useState<QuickDrawGuessPlayer[]>([])
  const [words, setWords] = useState<QuickDrawGuessWord[]>([])
  const [guesses, setGuesses] = useState<QuickDrawGuessGuess[]>([])
  const [guessText, setGuessText] = useState('')
  const [acting, setActing] = useState(false)
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
  const myTeamRow = teamRows.find((r) => r.player_id === bootstrap.myPlayerId)
  const isDrawer = session?.drawer_player_id === bootstrap.myPlayerId
  const onMyTeam = mode === 'individual' || myTeamRow?.team === session?.active_team
  const canGuess = session?.phase === 'turn' && !isDrawer && onMyTeam

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

  const liveTeamScores = useMemo(
    () => computeQuickDrawGuessScores(words, numTeams),
    [words, numTeams]
  )

  const liveIndividualScores = useMemo(
    () => quickDrawGuessIndividualLeaderboard(teamRows, bootstrap.players),
    [teamRows, bootstrap.players]
  )

  const guessFeed = useMemo(() => {
    const nameById = new Map(bootstrap.players.map((p) => [p.id, p.name]))
    return guesses.slice(0, 12).map((g) => ({
      id: g.id,
      primary: g.text,
      secondary: `${nameById.get(g.player_id) ?? 'Player'}${g.correct ? ` · +${g.points}` : ''}`,
    }))
  }, [guesses, bootstrap.players])

  const turnSecondsLeft = useAbsoluteDeadline(
    session?.turn_deadline_at,
    session?.phase === 'turn'
  )
  const breakSecondsLeft = useAbsoluteDeadline(
    session?.break_deadline_at,
    session?.phase === 'break'
  )

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
      return (
        <GameFinishPanel bootstrap={bootstrap} title="Final results" subtitle="Final standings" detail={top ? `${top.name} — ${top.score} pts` : undefined} leaderboard={scoreListLeaderboard(board)} />
      )
    }
    const scores = computeQuickDrawGuessScores(words, numTeams)
    const winners = quickDrawGuessWinningTeams(scores)
    const winnerLabel = winners.map((t) => teamLabel(t)).join(' & ')
    return (
      <GameFinishPanel bootstrap={bootstrap} title="Final results" subtitle="Team scores" detail={winnerLabel ? `${winnerLabel} wins` : undefined} leaderboard={toLeaderboardRows(scores.map((row) => ({ name: teamLabel(row.team), score: row.score })))} />
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

  return (
    <GameShell bootstrap={bootstrap} title={batch8GameLabel('quick_draw')} subtitle={mode === 'team' ? teamLabel(session.active_team) : 'Individual'}>
      <ScrollView contentContainerStyle={styles.content}>
        <TurnBanner text={statusText} isMyTurn={isDrawer || canGuess} />

        {mode === 'team' && myTeamRow?.team ? (
          <View style={styles.teamRow}>
            <Text style={styles.teamRowLabel}>You're on</Text>
            <TeamBadge team={myTeamRow.team} />
          </View>
        ) : null}

        {turnSecondsLeft > 0 && session.phase === 'turn' ? <TimerBadge seconds={turnSecondsLeft} /> : null}

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
            title="Round break"
            message={session.status_message ?? 'Next turn starting soon…'}
            secondsLeft={breakSecondsLeft}
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
              onSkip={() => void act(() => postQuickDrawGuessSkip(bootstrap.code, bootstrap.myResumeToken!))}
              skipDisabled={acting}
            />
          ) : (
            <LiveDrawingCanvas
              strokeData={strokeData}
              readOnly
              resetKey={`${session.turn_index}-watch`}
            />
          )
        ) : null}

        {canGuess ? (
          <View style={styles.guessBox}>
            <TextInput
              style={styles.input}
              value={guessText}
              onChangeText={setGuessText}
              placeholder="Type your guess"
              placeholderTextColor={theme.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.primaryBtn, acting && styles.btnDisabled]}
              disabled={acting || !guessText.trim()}
              onPress={() => void act(() => postQuickDrawGuess(bootstrap.code, bootstrap.myResumeToken!, guessText.trim()))}
            >
              <Text style={styles.primaryBtnText}>Guess</Text>
            </Pressable>
          </View>
        ) : null}

        <ActivityFeed title="Recent guesses" items={guessFeed} emptyText="No guesses yet" />
      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamRowLabel: { color: theme.textMuted, fontSize: 14 },
  content: { paddingBottom: 32, gap: 12 },
  status: { color: theme.textSecondary, fontSize: 14 },
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
