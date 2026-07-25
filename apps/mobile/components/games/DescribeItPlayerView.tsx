import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  type DescribeItGuess,
  type DescribeItPlayer,
  type DescribeItSession,
  type DescribeItWord,
  type Game,
  type Player,
} from '@fateround/shared'
import { batch4GameLabel } from '@fateround/shared/batch-4-games'
import {
  clampDescribeItMode,
  clampDescribeItTeams,
  computeDescribeItScores,
  describeItIndividualLeaderboard,
  describeItWinningTeams,
  isDescribeItResultsPhase,
  teamLabel,
  DESCRIBE_IT_MIN_PLAYERS,
  DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL,
} from '@fateround/shared/describe-it'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import { LateJoinChoiceScreen } from '@/components/lifecycle/LateJoinChoiceScreen'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { GameInfoChips } from '@/components/GameInfoChips'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useHeaderBadge } from '@/components/session/HeaderBadgeContext'
import { ReplayReadyRing } from '@/components/lifecycle/ReplayReadyRing'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { DescribeItAchievementPosts } from '@/components/games/DescribeItAchievementPosts'
import { DescribeItShareCard } from '@/components/games/DescribeItShareCard'
import { ActivityFeed } from '@/components/party/ActivityFeed'
import { RoundBreakCard } from '@/components/party/RoundBreakCard'
import { TeamBadge } from '@/components/party/TeamBadge'
import { TeamPickerGrid } from '@/components/party/TeamPickerGrid'
import { TeamScoreGrid } from '@/components/party/TeamScoreGrid'
import { KeyboardAwareGameScroll } from '@/components/ui/KeyboardAwareGameScroll'
import { useGameScores, useGameStats } from '@/components/session/RosterDrawerContext'
import { DeadlineTimerBadge } from '@/components/ui/DeadlineTimerBadge'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import {
  postDescribeItAdvance,
  postDescribeItClue,
  postDescribeItExpireTurn,
  postDescribeItGuess,
  postDescribeItSkip,
  postDescribeItTeam,
} from '@/lib/game-api'
import { useTurnExpiryTimer } from '@/hooks/useTurnExpiryTimer'
import { getSupabase } from '@/lib/supabase'
import {
  DESCRIBE_IT_GUESS_SELECT,
  DESCRIBE_IT_PLAYER_SELECT,
  DESCRIBE_IT_SESSION_SELECT,
  DESCRIBE_IT_WORD_SELECT,
} from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { scoreListLeaderboard, toLeaderboardRows } from '@/lib/finish-leaderboards'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Screen =
  | 'loading'
  | 'join'
  | 'late_join_choice'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'playing'
  | 'finished'
  | 'not_found'

/** Team that plays turn `turnIndex` (mirrors web `teamForTurn`). */
const teamForTurn = (turnIndex: number, numTeams: number): number => (turnIndex % numTeams) + 1

/** Total turns in the match (mirrors web `describeItTotalTurns`). */
const describeItTotalTurns = (
  mode: 'team' | 'individual',
  numTeams: number,
  rosterLen: number,
  totalRounds: number
): number => (mode === 'individual' ? rosterLen : numTeams) * totalRounds

export function DescribeItPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [session, setSession] = useState<DescribeItSession | null>(null)
  const [teamRows, setTeamRows] = useState<DescribeItPlayer[]>([])
  const [words, setWords] = useState<DescribeItWord[]>([])
  const [guesses, setGuesses] = useState<DescribeItGuess[]>([])
  const [clueText, setClueText] = useState('')
  const [guessText, setGuessText] = useState('')
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: DescribeItSession | null; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [sessionRes, teamRes, wordRes, guessRes] = await Promise.all([
        getSupabase().from('describe_it_sessions').select(DESCRIBE_IT_SESSION_SELECT).eq('game_id', code).maybeSingle(),
        getSupabase()
          .from('describe_it_players')
          .select(DESCRIBE_IT_PLAYER_SELECT)
          .eq('game_id', code)
          .order('created_at'),
        getSupabase().from('describe_it_words').select(DESCRIBE_IT_WORD_SELECT).eq('game_id', code),
        getSupabase()
          .from('describe_it_guesses')
          .select(DESCRIBE_IT_GUESS_SELECT)
          .eq('game_id', code)
          .order('created_at', { ascending: false })
          .limit(40),
      ])
      if (sessionRes.error || teamRes.error || wordRes.error || guessRes.error) {
        return { state: null, ok: false }
      }
      const sessionData = sessionRes.data as DescribeItSession | null
      setSession(sessionData)
      setTeamRows((teamRes.data as DescribeItPlayer[]) ?? [])
      setWords((wordRes.data as DescribeItWord[]) ?? [])
      setGuesses((guessRes.data as DescribeItGuess[]) ?? [])
      return { state: sessionData, ok: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback(
    (game: Game, playerId: string | null, sessionData: DescribeItSession | null): Screen => {
      if (!playerId) {
        const pre = preJoinScreen(game, false)
        if (pre === 'game_ended') return 'game_ended'
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'late_join_choice') return 'late_join_choice'
        return 'join'
      }
      if (game.status === 'waiting') return 'waiting'
      if (isDescribeItResultsPhase(game.status, sessionData)) return 'finished'
      if (game.status === 'active') return 'playing'
      return 'waiting'
    },
    []
  )

  const bootstrap = useGameViewBootstrap<Screen, DescribeItSession | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen,
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)
  const lateJoin = useLateJoinContext(gameCode, bootstrap.game, bootstrap.screen === 'late_join_choice')

  useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      'describe_it_sessions',
      'describe_it_players',
      'describe_it_words',
      'describe_it_guesses',
    ],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const mode = clampDescribeItMode(bootstrap.game?.describe_it_mode)
  const numTeams = clampDescribeItTeams(bootstrap.game?.describe_it_num_teams)
  // Surface the mode (N teams / Individual) as the header pill on every screen.
  useHeaderBadge(bootstrap.game ? (mode === 'team' ? `${numTeams} teams` : 'Individual') : null)
  const myTeamRow = teamRows.find((r) => r.player_id === bootstrap.myPlayerId)
  const isDescriber = session?.describer_player_id === bootstrap.myPlayerId
  const mePlayer = bootstrap.myPlayerId ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) : undefined
  const isViewer = !!(mePlayer && bootstrap.game && playerIsViewer(mePlayer, bootstrap.game))
  // Gate on the LIVE roster (describe_it_players/teamRows), not the frozen session.roster —
  // late joiners are seeded into describe_it_players but never into session.roster, so the
  // snapshot hid the guess input from them. Mirrors the server's processIndividualGuess check.
  const inRoster = !!bootstrap.myPlayerId && teamRows.some((r) => r.player_id === bootstrap.myPlayerId)
  const onMyTeam = mode === 'individual' ? inRoster : myTeamRow?.team === session?.active_team
  // Whether I'm eligible to guess this turn — the clue-gate is a *display* concern
  // handled in the guess panel (mirrors web `canGuess`).
  const canGuess = session?.phase === 'turn' && !isDescriber && !isViewer && onMyTeam
  // Individual mode: once I've guessed the word this turn, the guess box is replaced
  // by a "waiting for others" note so I can't keep spamming.
  const myGuessedThisTurn =
    !!session &&
    guesses.some((g) => g.turn_index === session.turn_index && g.player_id === bootstrap.myPlayerId && g.correct)

  // Foreground turn/start nudge — mirrors web `useTurnNotifications({ status })`.
  useTurnNotifications({ status: bootstrap.game?.status, isMyTurn: isDescriber })

  const act = async (fn: () => Promise<unknown>) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await fn()
      setClueText('')
      setGuessText('')
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  const pickTeam = (team: number) => act(() => postDescribeItTeam(bootstrap.code, bootstrap.myResumeToken!, team))

  const sendClue = () => {
    const trimmed = clueText.trim()
    if (!trimmed) return
    void act(() => postDescribeItClue(bootstrap.code, bootstrap.myResumeToken!, trimmed))
  }

  const sendGuess = () => {
    const trimmed = guessText.trim()
    if (!trimmed) return
    void act(() => postDescribeItGuess(bootstrap.code, bootstrap.myResumeToken!, trimmed))
  }

  const skipWord = () => void act(() => postDescribeItSkip(bootstrap.code, bootstrap.myResumeToken!))

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

  const liveTeamScores = useMemo(() => computeDescribeItScores(words, numTeams), [words, numTeams])

  const liveIndividualScores = useMemo(
    () => describeItIndividualLeaderboard(teamRows, bootstrap.players),
    [teamRows, bootstrap.players]
  )
  useGameScores(
    useMemo(
      () => (mode === 'team' ? null : Object.fromEntries(liveIndividualScores.map((row) => [row.id, row.score]))),
      [mode, liveIndividualScores]
    ),
    { suffix: ' pts' }
  )
  useGameStats(
    useMemo(() => {
      if (mode === 'team') return null
      const counts: Record<string, number> = {}
      for (const g of guesses) if (g.correct) counts[g.player_id] = (counts[g.player_id] ?? 0) + 1
      return Object.fromEntries(liveIndividualScores.map((row) => [row.id, `✅ ${counts[row.id] ?? 0} guessed`]))
    }, [mode, liveIndividualScores, guesses])
  )

  const guessFeed = useMemo(() => {
    const nameById = new Map(bootstrap.players.map((p) => [p.id, p.name]))
    // Anti-cheat: in individual mode, never show another player's guess TEXT, so a
    // slow guesser can't copy a rival's correct word off the feed. Mirrors web.
    const hideOthersText = mode === 'individual'
    // Only show guesses from the CURRENT turn, so stale guesses from earlier
    // words/turns don't bleed into the live feed (mirrors web GuessFeed).
    const turnIndex = session?.turn_index ?? -1
    return guesses
      .filter((g) => g.turn_index === turnIndex)
      .slice(0, 12)
      .map((g) => {
        const name = nameById.get(g.player_id) ?? 'Player'
        const mask = hideOthersText && g.player_id !== bootstrap.myPlayerId
        const primary = mask ? (g.correct ? 'guessed it ✅' : 'guessing…') : g.text
        return {
          id: g.id,
          primary,
          secondary: `${name}${g.correct && !mask ? ' · correct!' : ''}`,
        }
      })
  }, [guesses, bootstrap.players, bootstrap.myPlayerId, mode, session?.turn_index])

  // Drive the round forward when a phase timer runs out — any active non-viewer
  // client fires (idempotent + deadline-gated server-side), matching web. Without
  // this an all-mobile table's turn/break just hangs at 0.
  const canDriveTimers = bootstrap.game?.status === 'active' && !isViewer
  useTurnExpiryTimer({
    deadlineAt: session?.phase === 'turn' ? session?.turn_deadline_at : null,
    enabled: canDriveTimers,
    onExpire: () => postDescribeItExpireTurn(bootstrap.code).then(() => bootstrap.load()),
  })
  useTurnExpiryTimer({
    deadlineAt: session?.phase === 'break' ? session?.break_deadline_at : null,
    enabled: canDriveTimers,
    onExpire: () => postDescribeItAdvance(bootstrap.code).then(() => bootstrap.load()),
  })

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />
  if (bootstrap.screen === 'game_ended') return <GameEndedScreen game={bootstrap.game} />
  if (bootstrap.screen === 'game_started_waiting' && bootstrap.game) {
    return (
      <GameStartedWaitingScreen
        gameCode={bootstrap.code}
        game={bootstrap.game}
        onLobbyOpen={() => void bootstrap.load()}
      />
    )
  }
  if (bootstrap.screen === 'late_join_choice' && bootstrap.game) {
    return (
      <LateJoinChoiceScreen
        gameCode={bootstrap.code}
        game={bootstrap.game}
        context={lateJoin.context}
        contextLoading={lateJoin.loading}
        nameInput={bootstrap.joinName}
        onNameChange={bootstrap.setJoinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
        onJoinAsPlayer={() => void bootstrap.join(undefined, { joinAsViewer: false })}
      />
    )
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
        lobbyFull={bootstrap.lobbyFull}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
        infoChips={<GameInfoChips game={bootstrap.game} />}
      />
    )
  }

  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    // "Play again · same settings" reopened the lobby with the ready-up ring
    // (readiness = holding a seat), using describe-it's own min-player thresholds.
    if (bootstrap.game.replay_pending) {
      return (
        <GameShell bootstrap={bootstrap} title={batch4GameLabel('describe_it')}>
          <ReplayReadyRing
            gameCode={bootstrap.code}
            players={bootstrap.players}
            myPlayerId={bootstrap.myPlayerId}
            myResumeToken={bootstrap.myResumeToken ?? null}
            minPlayers={mode === 'individual' ? DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL : DESCRIBE_IT_MIN_PLAYERS}
            onReload={() => bootstrap.load()}
          />
        </GameShell>
      )
    }
    if (mode === 'individual') {
      return (
        <LobbyView
          {...lobbyProps!}
          onLeft={onLeft}
          activity={
            <View style={styles.soloCard}>
              <Text style={styles.soloTitle}>Everyone plays solo 🏆</Text>
              <Text style={styles.soloBody}>
                You'll take turns describing a word while everyone races to guess. Fastest guessers score the most.
              </Text>
            </View>
          }
        />
      )
    }
    return (
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('describe_it')} subtitle="Pick your team">
        <TeamPickerGrid
          numTeams={numTeams}
          myTeam={myTeamRow?.team}
          teamCounts={teamCounts}
          teamMembers={teamMembers}
          onPickTeam={(team) => void pickTeam(team)}
          acting={acting}
          help="Choose a team before the host starts."
        />
      </GameShell>
    )
  }

  if (!bootstrap.game || !session) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    if (mode === 'individual') {
      const board = describeItIndividualLeaderboard(teamRows, bootstrap.players)
      const top = board[0]
      return (
        <GameShell bootstrap={bootstrap} title={batch4GameLabel('describe_it')} subtitle={bootstrap.code}>
          <GameFinishPanel
            bootstrap={bootstrap}
            emoji={top && top.score > 0 ? '🏆' : '🏁'}
            title={top && top.score > 0 ? `${top.name} wins!` : 'Final results'}
            subtitle="Final standings"
            detail={top && top.score > 0 ? `${top.score} pts` : undefined}
            winnerPlayerId={top && top.score > 0 ? top.id : null}
            roundKey={session.id}
            notice={
              <>
                <DescribeItShareCard
                  mode="individual"
                  board={board}
                  highlightPlayerId={bootstrap.myPlayerId}
                  hideHeader
                />
                {bootstrap.myPlayerId ? (
                  <DescribeItAchievementPosts
                    guesses={guesses}
                    roster={session.roster ?? []}
                    players={bootstrap.players}
                    isIndividual
                    myPlayerId={bootstrap.myPlayerId}
                    gameCode={bootstrap.code}
                    roundKey={session.id}
                  />
                ) : null}
              </>
            }
          />
        </GameShell>
      )
    }
    const scores = computeDescribeItScores(words, numTeams)
    const winners = describeItWinningTeams(scores)
    const winnerLabel = winners.map((t) => teamLabel(t)).join(', ')
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
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('describe_it')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          emoji={winners.length > 0 ? '🏆' : '🏁'}
          title={winnerLabel ? `${winnerLabel} wins!` : 'Final results'}
          subtitle="Team scores"
          detail={winnerLabel ? undefined : 'No words guessed'}
          notice={
            <DescribeItShareCard
              mode="team"
              teamScores={scores}
              winners={winners}
              topGuessers={topGuessers}
              hideHeader
            />
          }
        />
      </GameShell>
    )
  }

  const describerName = bootstrap.players.find((p) => p.id === session.describer_player_id)?.name ?? 'Describer'
  const statusText =
    session.status_message ??
    (session.phase === 'break'
      ? 'Short break — next turn starting soon'
      : mode === 'individual'
        ? `${describerName} is describing`
        : `${teamLabel(session.active_team)} is up`)

  // Break card next-up hint: the final turn tips into results; otherwise the next
  // describer (individual) or next team (team) is up (mirrors web break card).
  const totalTurns = describeItTotalTurns(mode, numTeams, session.roster?.length ?? 0, session.total_rounds)
  const isLastTurn = session.turn_index + 1 >= totalTurns
  const breakDetail = isLastTurn
    ? 'Final results next'
    : mode === 'individual'
      ? 'Next describer up'
      : `Up next: ${teamLabel(teamForTurn(session.turn_index + 1, numTeams))}`

  return (
    <GameShell
      title={batch4GameLabel('describe_it')}
      subtitle={`Round ${session.current_round} · turn ${session.turn_index + 1}`}
      gameCode={bootstrap.code}
      game={bootstrap.game}
      players={bootstrap.players}
      myPlayerId={bootstrap.myPlayerId}
      onPromoted={() => bootstrap.load()}
    >
      <KeyboardAwareGameScroll contentContainerStyle={styles.content}>
        <TurnBanner text={statusText} isMyTurn={isDescriber || canGuess} />

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
        ) : null}

        {session.phase === 'break' ? (
          <RoundBreakCard
            title={isLastTurn ? 'Last turn done' : 'Round break'}
            message={session.status_message ?? 'Next turn starting soon…'}
            deadlineAt={session?.break_deadline_at}
            active={session.phase === 'break'}
            detail={breakDetail}
          />
        ) : (
          <>
            {isDescriber ? (
              <View style={styles.panel}>
                <Text style={styles.wordLabel}>Your word</Text>
                <Text style={styles.word}>{session.current_word ?? '—'}</Text>
                {(session.current_clues?.length ?? 0) > 0 ? (
                  <View style={styles.clueList}>
                    {session.current_clues!.map((clue, index) => (
                      <Text key={index} style={styles.clueItem}>
                        {clue}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <TextInput
                  style={styles.input}
                  value={clueText}
                  onChangeText={setClueText}
                  placeholder="Send a clue (no secret word!)"
                  placeholderTextColor={theme.textFaint}
                />
                <View style={styles.row}>
                  <Pressable style={styles.primaryBtn} disabled={acting} onPress={sendClue}>
                    <Text style={styles.primaryText}>Send clue</Text>
                  </Pressable>
                  {mode === 'team' ? (
                    <Pressable style={styles.secondaryBtn} disabled={acting} onPress={skipWord}>
                      <Text style={styles.secondaryText}>Skip word</Text>
                    </Pressable>
                  ) : null}
                </View>
                {mode === 'individual' && (session.current_clues?.length ?? 0) === 0 ? (
                  <Text style={styles.hint}>The guessers' timer starts when you send your first clue.</Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.panel}>
                {(session.current_clues?.length ?? 0) > 0 ? (
                  // Plain View, not a nested ScrollView — the outer page scroll
                  // owns scrolling, so clues flow inline and don't swallow the
                  // drag gesture needed to reach the guess input below.
                  <View style={styles.clueList}>
                    {session.current_clues!.map((clue, index) => (
                      <Text key={index} style={styles.clueItem}>
                        {clue}
                      </Text>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.waiting}>Waiting for the first clue…</Text>
                )}
                {mode === 'individual' && myGuessedThisTurn ? (
                  <Text style={styles.gotIt}>✅ You got it! Waiting for the others…</Text>
                ) : canGuess && mode === 'individual' && (session.current_clues?.length ?? 0) === 0 ? (
                  // Individual mode: the guessing timer only starts on the first clue.
                  <Text style={styles.gateHint}>Guessing opens with the first clue…</Text>
                ) : canGuess ? (
                  <>
                    <TextInput
                      style={styles.input}
                      value={guessText}
                      onChangeText={setGuessText}
                      placeholder="Type your guess"
                      placeholderTextColor={theme.textFaint}
                      onSubmitEditing={sendGuess}
                    />
                    <Pressable style={styles.primaryBtn} disabled={acting} onPress={sendGuess}>
                      <Text style={styles.primaryText}>Guess</Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={styles.gateHint}>
                    {isViewer
                      ? 'Watching this round'
                      : mode === 'individual'
                        ? 'Watching'
                        : onMyTeam
                          ? 'Watch and wait for your turn…'
                          : 'Another team is playing…'}
                  </Text>
                )}
              </View>
            )}

            <ActivityFeed embedded title="Recent guesses" items={guessFeed} emptyText="No guesses yet" />
          </>
        )}
      </KeyboardAwareGameScroll>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    teamRowLabel: { color: theme.textMuted, fontSize: 14 },
    waiting: { color: theme.textMuted, fontSize: 16, textAlign: 'center', marginTop: 24 },
    hint: { color: theme.textFaint, fontSize: 12, textAlign: 'center' },
    gateHint: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
    // emerald success — kept consistent across themes for the "you got it" note
    gotIt: { color: '#10b981', fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 4 },
    soloCard: { backgroundColor: theme.surface, borderRadius: 12, padding: 16, gap: 4 },
    soloTitle: { color: theme.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
    soloBody: { color: theme.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
    panel: { backgroundColor: theme.surface, borderRadius: 12, padding: 16, gap: 12 },
    wordLabel: { color: theme.textMuted, fontSize: 13 },
    word: { color: theme.text, fontSize: 28, fontWeight: '800' },
    clueList: { gap: 6 },
    content: { paddingBottom: 32, gap: 14 },
    clueItem: { color: theme.textSecondary, fontSize: 15, lineHeight: 22 },
    input: {
      backgroundColor: theme.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.text,
      padding: 12,
      fontSize: 16,
    },
    row: { flexDirection: 'row', gap: 8 },
    primaryBtn: {
      flex: 1,
      backgroundColor: theme.primary,
      borderRadius: 10,
      padding: 14,
      alignItems: 'center',
    },
    // white on the solid rose primary button — intentional
    primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    secondaryBtn: {
      backgroundColor: theme.border,
      borderRadius: 10,
      padding: 14,
      alignItems: 'center',
    },
    secondaryText: { color: theme.text, fontWeight: '600', fontSize: 15 },
  })
