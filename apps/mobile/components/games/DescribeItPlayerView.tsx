import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
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
} from '@fateround/shared/describe-it'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { ActivityFeed } from '@/components/party/ActivityFeed'
import { RoundBreakCard } from '@/components/party/RoundBreakCard'
import { TeamBadge } from '@/components/party/TeamBadge'
import { TeamPickerGrid } from '@/components/party/TeamPickerGrid'
import { TeamScoreGrid } from '@/components/party/TeamScoreGrid'
import { useAbsoluteDeadline } from '@/components/party/useAbsoluteDeadline'
import { LeaderboardPanel } from '@/components/ui/LeaderboardPanel'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import {
  postDescribeItClue,
  postDescribeItGuess,
  postDescribeItSkip,
  postDescribeItTeam,
} from '@/lib/game-api'
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

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

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
      if (!playerId) return 'join'
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
  const myTeamRow = teamRows.find((r) => r.player_id === bootstrap.myPlayerId)
  const isDescriber = session?.describer_player_id === bootstrap.myPlayerId
  const onMyTeam = mode === 'individual' || myTeamRow?.team === session?.active_team
  const canGuess =
    session?.phase === 'turn' &&
    !isDescriber &&
    onMyTeam &&
    (mode === 'team' || (session.current_clues?.length ?? 0) > 0)

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

  const liveTeamScores = useMemo(
    () => computeDescribeItScores(words, numTeams),
    [words, numTeams]
  )

  const liveIndividualScores = useMemo(
    () => describeItIndividualLeaderboard(teamRows, bootstrap.players),
    [teamRows, bootstrap.players]
  )

  const guessFeed = useMemo(() => {
    const nameById = new Map(bootstrap.players.map((p) => [p.id, p.name]))
    return guesses.slice(0, 12).map((g) => ({
      id: g.id,
      primary: g.text,
      secondary: `${nameById.get(g.player_id) ?? 'Player'}${g.correct ? ' · correct!' : ''}`,
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
    if (mode === 'individual') {
      return (
        <LobbyView {...lobbyProps!} onLeft={onLeft} />
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
          <GameFinishPanel bootstrap={bootstrap} title="Final results" subtitle="Final standings" detail={top ? `${top.name} — ${top.score} pts` : undefined} leaderboard={scoreListLeaderboard(board)} />
        </GameShell>
      )
    }
    const scores = computeDescribeItScores(words, numTeams)
    const winners = describeItWinningTeams(scores)
    const winnerLabel = winners.map((t) => teamLabel(t)).join(', ')
    return (
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('describe_it')} subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title="Final results" subtitle="Team scores" detail={winnerLabel ? `${winnerLabel} wins` : undefined} leaderboard={toLeaderboardRows(scores.map((row) => ({ name: teamLabel(row.team), score: row.score })))} />
      </GameShell>
    )
  }

  const describerName =
    bootstrap.players.find((p) => p.id === session.describer_player_id)?.name ?? 'Describer'
  const statusText =
    session.status_message ??
    (session.phase === 'break'
      ? 'Short break — next turn starting soon'
      : mode === 'individual'
        ? `${describerName} is describing`
        : `${teamLabel(session.active_team)} is up`)

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
      <TurnBanner text={statusText} isMyTurn={isDescriber || canGuess} />

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
          detail={mode === 'team' ? `Up next: ${teamLabel(session.active_team)}` : undefined}
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
            </View>
          ) : canGuess ? (
            <View style={styles.panel}>
              {(session.current_clues?.length ?? 0) > 0 ? (
                <ScrollView style={styles.clueScroll}>
                  {session.current_clues!.map((clue, index) => (
                    <Text key={index} style={styles.clueItem}>
                      {clue}
                    </Text>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.waiting}>Waiting for the first clue…</Text>
              )}
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
            </View>
          ) : (
            <Text style={styles.waiting}>
              {onMyTeam ? 'Watch and wait for your turn…' : 'Another team is playing…'}
            </Text>
          )}

          <ActivityFeed title="Recent guesses" items={guessFeed} emptyText="No guesses yet" />
        </>
      )}
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  teamRowLabel: { color: theme.textMuted, fontSize: 14 },
  waiting: { color: theme.textMuted, fontSize: 16, textAlign: 'center', marginTop: 24 },
  panel: { backgroundColor: theme.surface, borderRadius: 12, padding: 16, gap: 12 },
  wordLabel: { color: theme.textMuted, fontSize: 13 },
  word: { color: theme.text, fontSize: 28, fontWeight: '800' },
  clueList: { gap: 6 },
  clueScroll: { maxHeight: 120 },
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
