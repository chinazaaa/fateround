import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { type Game, type Player, type WordRushAnswer, type WordRushPlayer, type WordRushSession } from '@fateround/shared'
import { batch5GameLabel } from '@fateround/shared/batch-5-games'
import {
  clampWordRushMode,
  clampWordRushTeams,
  computeWordRushPlayerScores,
  computeWordRushTeamScores,
  currentTeamRoundNumber,
  isWordRushResultsPhase,
  tallyWordRushScores,
  teamLabel,
  wordRushMinLengthForRound,
} from '@fateround/shared/word-rush'
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
import { postWordRushPrompt, postWordRushSubmit, postWordRushTeam } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { WORD_RUSH_ANSWER_SELECT, WORD_RUSH_PLAYER_SELECT, WORD_RUSH_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { scoreListLeaderboard } from '@/lib/finish-leaderboards'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function WordRushPlayerView({ gameCode }: { gameCode: string }) {
  const [session, setSession] = useState<WordRushSession | null>(null)
  const [teamRows, setTeamRows] = useState<WordRushPlayer[]>([])
  const [answers, setAnswers] = useState<WordRushAnswer[]>([])
  const [wordText, setWordText] = useState('')
  const [startLetter, setStartLetter] = useState('')
  const [endLetter, setEndLetter] = useState('')
  const [acting, setActing] = useState(false)
  const [lastMessage, setLastMessage] = useState<string | null>(null)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: WordRushSession | null; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [sessionRes, teamRes, answerRes] = await Promise.all([
        getSupabase().from('word_rush_sessions').select(WORD_RUSH_SESSION_SELECT).eq('game_id', code).maybeSingle(),
        getSupabase().from('word_rush_players').select(WORD_RUSH_PLAYER_SELECT).eq('game_id', code).order('created_at'),
        getSupabase()
          .from('word_rush_answers')
          .select(WORD_RUSH_ANSWER_SELECT)
          .eq('game_id', code)
          .order('created_at', { ascending: false })
          .limit(80),
      ])
      if (sessionRes.error || teamRes.error || answerRes.error) return { state: null, ok: false }
      const sessionData = sessionRes.data as WordRushSession | null
      setSession(sessionData)
      setTeamRows((teamRes.data as WordRushPlayer[]) ?? [])
      setAnswers((answerRes.data as WordRushAnswer[]) ?? [])
      return { state: sessionData, ok: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback(
    (game: Game, playerId: string | null, sessionData: WordRushSession | null): Screen => {
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      if (isWordRushResultsPhase(game.status, sessionData)) return 'finished'
      if (game.status === 'active') return 'playing'
      return 'waiting'
    },
    []
  )

  const bootstrap = useGameViewBootstrap<Screen, WordRushSession | null>({
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
    [{ table: 'games', column: 'id' }, 'word_rush_sessions', 'word_rush_players', 'word_rush_answers'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const mode = clampWordRushMode(bootstrap.game?.word_rush_mode)
  const numTeams = clampWordRushTeams(bootstrap.game?.word_rush_num_teams)
  const myTeamRow = teamRows.find((r) => r.player_id === bootstrap.myPlayerId)
  const isPromptSetter = session?.prompt_setter_player_id === bootstrap.myPlayerId
  const onMyTeam = mode === 'individual' || myTeamRow?.team === session?.active_team
  const minLength = session
    ? wordRushMinLengthForRound(session.current_round, session.difficulty)
    : 3

  const act = async (fn: () => Promise<unknown>) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await fn()
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
    () => computeWordRushTeamScores(answers, numTeams),
    [answers, numTeams]
  )

  const livePlayerScores = useMemo(
    () => computeWordRushPlayerScores(bootstrap.players, teamRows),
    [bootstrap.players, teamRows]
  )

  const recentCorrect = useMemo(() => {
    const nameById = new Map(bootstrap.players.map((p) => [p.id, p.name]))
    return answers
      .filter((a) => a.correct)
      .slice(0, 10)
      .map((a) => ({
        id: a.id,
        primary: a.text,
        secondary:
          mode === 'team'
            ? `${teamLabel(a.team)} · ${nameById.get(a.player_id) ?? 'Player'}`
            : (nameById.get(a.player_id) ?? 'Player'),
      }))
  }, [answers, bootstrap.players, mode])

  const turnSecondsLeft = useAbsoluteDeadline(
    session?.turn_deadline_at,
    session?.phase === 'playing'
  )
  const intermissionSecondsLeft = useAbsoluteDeadline(
    session?.intermission_deadline_at,
    session?.phase === 'intermission'
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
      return <LobbyView {...lobbyProps!} onLeft={onLeft} />
    }
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('word_rush')} subtitle="Pick your team">
        <TeamPickerGrid
          numTeams={numTeams}
          myTeam={myTeamRow?.team}
          teamCounts={teamCounts}
          teamMembers={teamMembers}
          onPickTeam={(team) => void act(() => postWordRushTeam(bootstrap.code, bootstrap.myResumeToken!, team))}
          acting={acting}
          help="Choose a team before the host starts."
        />
      </GameShell>
    )
  }

  if (!bootstrap.game || !session) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const board = tallyWordRushScores(mode, bootstrap.players, teamRows, answers, numTeams)
    const top = board[0]
    const detail =
      top && 'name' in top ? `${top.name} — ${top.score} pts` : top ? `${teamLabel(top.team)} wins` : undefined
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('word_rush')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title="Final results"
          subtitle="Final standings"
          detail={detail}
          leaderboard={scoreListLeaderboard(
            board.map((row) =>
              'name' in row
                ? { name: row.name, score: row.score }
                : { name: teamLabel(row.team), score: row.score }
            )
          )}
        />
      </GameShell>
    )
  }

  const submitWord = async () => {
    const text = wordText.trim()
    if (!text || !bootstrap.myResumeToken) return
    setLastMessage(null)
    setActing(true)
    try {
      const result = await postWordRushSubmit(bootstrap.code, bootstrap.myResumeToken, text)
      if (!result.correct) setLastMessage(result.message ?? 'Not accepted')
      else {
        setWordText('')
        setLastMessage(`+${result.points ?? 0} pts`)
      }
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  const setPrompt = async () => {
    if (!startLetter.trim() || !endLetter.trim()) return
    await act(() =>
      postWordRushPrompt(
        bootstrap.code,
        bootstrap.myResumeToken!,
        startLetter.trim(),
        endLetter.trim(),
        minLength
      )
    )
    setStartLetter('')
    setEndLetter('')
  }

  const teamRound =
    mode === 'team' && session ? currentTeamRoundNumber(session.turn_index, numTeams) : session.current_round

  return (
    <GameShell bootstrap={bootstrap} title={batch5GameLabel('word_rush')} subtitle={session.status_message ?? bootstrap.code}>
      <TurnBanner
        text={
          session.phase === 'intermission'
            ? 'Round break…'
            : session.phase === 'awaiting_prompt'
              ? 'Waiting for letter pair…'
              : mode === 'team' && !onMyTeam
                ? `${teamLabel(session.active_team)} is playing`
                : `${session.start_letter?.toUpperCase() ?? '?'} → ${session.end_letter?.toUpperCase() ?? '?'}`
        }
        isMyTurn={onMyTeam && session.phase === 'playing'}
      />

      {mode === 'team' && myTeamRow?.team ? (
        <View style={styles.teamRow}>
          <Text style={styles.teamRowLabel}>You're on</Text>
          <TeamBadge team={myTeamRow.team} />
        </View>
      ) : null}

      {turnSecondsLeft > 0 && session.phase === 'playing' ? <TimerBadge seconds={turnSecondsLeft} /> : null}

      {mode === 'team' ? (
        <TeamScoreGrid
          scores={liveTeamScores}
          activeTeam={session.phase === 'playing' ? session.active_team : null}
          myTeam={myTeamRow?.team}
          round={teamRound}
          totalRounds={session.total_rounds}
        />
      ) : (
        <LeaderboardPanel
          title="Leaderboard"
          rows={livePlayerScores.map((row) => ({
            id: row.id,
            name: row.name,
            score: row.score,
            highlight: row.id === bootstrap.myPlayerId,
          }))}
          highlightId={bootstrap.myPlayerId}
        />
      )}

      {session.phase === 'intermission' ? (
        <RoundBreakCard
          title="Round break"
          message={session.status_message ?? 'Next round starting soon…'}
          secondsLeft={intermissionSecondsLeft}
          detail={mode === 'team' ? `Up next: ${teamLabel(session.active_team)}` : undefined}
        />
      ) : null}

      {session.phase !== 'intermission' && session.start_letter && session.end_letter ? (
        <View style={styles.promptDisplay}>
          <Text style={styles.promptLetter}>{session.start_letter.toUpperCase()}</Text>
          <Text style={styles.promptArrow}>→</Text>
          <Text style={styles.promptLetter}>{session.end_letter.toUpperCase()}</Text>
        </View>
      ) : null}

      {session.phase === 'awaiting_prompt' && isPromptSetter ? (
        <View style={styles.panel}>
          <Text style={styles.label}>Set the letter pair</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.letterInput}
              value={startLetter}
              onChangeText={setStartLetter}
              placeholder="Start"
              placeholderTextColor="#6b7280"
              maxLength={1}
              autoCapitalize="characters"
            />
            <Text style={styles.arrow}>→</Text>
            <TextInput
              style={styles.letterInput}
              value={endLetter}
              onChangeText={setEndLetter}
              placeholder="End"
              placeholderTextColor="#6b7280"
              maxLength={1}
              autoCapitalize="characters"
            />
          </View>
          <Pressable style={styles.primaryBtn} disabled={acting} onPress={() => void setPrompt()}>
            <Text style={styles.primaryText}>Set prompt</Text>
          </Pressable>
        </View>
      ) : null}

      {session.phase === 'playing' && onMyTeam ? (
        <View style={styles.panel}>
          <Text style={styles.hint}>Min {minLength} letters · starts & ends with shown letters</Text>
          <TextInput
            style={styles.input}
            value={wordText}
            onChangeText={setWordText}
            placeholder="Type a word"
            placeholderTextColor="#6b7280"
            onSubmitEditing={() => void submitWord()}
          />
          <Pressable style={styles.primaryBtn} disabled={acting} onPress={() => void submitWord()}>
            <Text style={styles.primaryText}>Submit</Text>
          </Pressable>
          {lastMessage ? <Text style={styles.feedback}>{lastMessage}</Text> : null}
        </View>
      ) : session.phase === 'playing' ? (
        <Text style={styles.waiting}>Watch and wait for your turn…</Text>
      ) : null}

      {mode === 'team' && session.phase === 'playing' ? (
        <ActivityFeed title="Recent correct" items={recentCorrect} emptyText="No correct words yet" />
      ) : null}
    </GameShell>
  )
}

const styles = StyleSheet.create({
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  teamRowLabel: { color: '#9ca3af', fontSize: 14 },
  promptDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 12,
  },
  promptLetter: { color: '#fff', fontSize: 40, fontWeight: '900' },
  promptArrow: { color: '#fda4af', fontSize: 28, fontWeight: '700' },
  waiting: { color: '#9ca3af', fontSize: 16, textAlign: 'center', marginTop: 24 },
  panel: { backgroundColor: '#17171d', borderRadius: 12, padding: 16, gap: 10 },
  label: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { color: '#9ca3af', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  letterInput: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a35',
    color: '#fff',
    padding: 12,
    fontSize: 24,
    textAlign: 'center',
  },
  arrow: { color: '#fff', fontSize: 24 },
  input: {
    backgroundColor: '#0b0b0f',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a35',
    color: '#fff',
    padding: 12,
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: '#f43f5e',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  feedback: { color: '#fbbf24', textAlign: 'center' },
})
