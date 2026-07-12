import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  type Game,
  type Player,
  type WordRushAnswer,
  type WordRushPlayer,
  type WordRushSession,
} from '@fateround/shared'
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
import { playerIsViewer } from '@fateround/shared/viewers'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useHeaderBadge } from '@/components/session/HeaderBadgeContext'
import { ReplayReadyRing } from '@/components/lifecycle/ReplayReadyRing'
import { ViewerModeBanner } from '@/components/lifecycle/ViewerModeBanner'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { ActivityFeed } from '@/components/party/ActivityFeed'
import { RoundBreakCard } from '@/components/party/RoundBreakCard'
import { TeamBadge } from '@/components/party/TeamBadge'
import { TeamPickerGrid } from '@/components/party/TeamPickerGrid'
import { TeamScoreGrid } from '@/components/party/TeamScoreGrid'
import { useAbsoluteDeadline } from '@/components/party/useAbsoluteDeadline'
import { KeyboardAwareGameScroll } from '@/components/ui/KeyboardAwareGameScroll'
import { LeaderboardPanel } from '@/components/ui/LeaderboardPanel'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import {
  postWordRushAdvance,
  postWordRushExpireTurn,
  postWordRushPrompt,
  postWordRushSubmit,
  postWordRushTeam,
} from '@/lib/game-api'
import { useTurnExpiryTimer } from '@/hooks/useTurnExpiryTimer'
import { getSupabase } from '@/lib/supabase'
import { WORD_RUSH_ANSWER_SELECT, WORD_RUSH_PLAYER_SELECT, WORD_RUSH_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { scoreListLeaderboard } from '@/lib/finish-leaderboards'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function WordRushPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [session, setSession] = useState<WordRushSession | null>(null)
  const [teamRows, setTeamRows] = useState<WordRushPlayer[]>([])
  const [answers, setAnswers] = useState<WordRushAnswer[]>([])
  const [wordText, setWordText] = useState('')
  const [startLetter, setStartLetter] = useState('')
  const [endLetter, setEndLetter] = useState('')
  const [minLengthText, setMinLengthText] = useState('')
  const [acting, setActing] = useState(false)
  const [lastMessage, setLastMessage] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

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
          .limit(400),
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
  // Surface the mode (N teams / Individual) as the header pill on every screen.
  useHeaderBadge(bootstrap.game ? (mode === 'team' ? `${numTeams} teams` : 'Individual') : null)
  const myTeamRow = teamRows.find((r) => r.player_id === bootstrap.myPlayerId)
  const isPromptSetter = session?.prompt_setter_player_id === bootstrap.myPlayerId
  const onMyTeam = mode === 'individual' || myTeamRow?.team === session?.active_team
  const minLength = session ? wordRushMinLengthForRound(session.current_round, session.difficulty) : 3

  const me = useMemo(
    () => bootstrap.players.find((p) => p.id === bootstrap.myPlayerId),
    [bootstrap.players, bootstrap.myPlayerId]
  )
  const isViewer = !!(bootstrap.game && me && playerIsViewer(me, bootstrap.game))

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

  const liveTeamScores = useMemo(() => computeWordRushTeamScores(answers, numTeams), [answers, numTeams])

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

  const turnSecondsLeft = useAbsoluteDeadline(session?.turn_deadline_at, session?.phase === 'playing')
  const intermissionSecondsLeft = useAbsoluteDeadline(
    session?.intermission_deadline_at,
    session?.phase === 'intermission'
  )

  // Drive the round forward when a phase timer runs out — any active non-viewer
  // client fires (idempotent + deadline-gated server-side), matching web. The turn
  // deadline covers both the playing and awaiting-prompt phases.
  const canDriveTimers = bootstrap.game?.status === 'active' && !isViewer
  useTurnExpiryTimer({
    deadlineAt:
      session?.phase === 'playing' || session?.phase === 'awaiting_prompt'
        ? session?.turn_deadline_at
        : null,
    enabled: canDriveTimers,
    onExpire: () => postWordRushExpireTurn(bootstrap.code).then(() => bootstrap.load()),
  })
  useTurnExpiryTimer({
    deadlineAt: session?.phase === 'intermission' ? session?.intermission_deadline_at : null,
    enabled: canDriveTimers,
    onExpire: () => postWordRushAdvance(bootstrap.code).then(() => bootstrap.load()),
  })

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
    if (bootstrap.game.replay_pending) {
      return (
        <GameShell bootstrap={bootstrap} title={batch5GameLabel('word_rush')}>
          <ReplayReadyRing
            gameCode={bootstrap.code}
            players={bootstrap.players}
            myPlayerId={bootstrap.myPlayerId}
            myResumeToken={bootstrap.myResumeToken ?? null}
            onReload={() => bootstrap.load()}
          />
        </GameShell>
      )
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
    const hasWinner = !!top && top.score > 0 && board.length > 1
    const detail =
      top && 'name' in top ? `${top.name} — ${top.score} pts` : top ? `${teamLabel(top.team)} wins` : undefined
    // Individual mode: highlight the winning player in the hero. Team mode has no
    // single player winner, so leave winnerPlayerId undefined there.
    const winnerPlayerId = hasWinner && top && 'id' in top ? (top as { id: string }).id : null
    const finishTitle = hasWinner
      ? top && 'name' in top
        ? `${top.name} wins!`
        : `${teamLabel((top as { team: number }).team)} wins!`
      : 'Final results'
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('word_rush')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={finishTitle}
          subtitle="Final standings"
          detail={detail}
          winnerPlayerId={winnerPlayerId}
          roundKey={session?.id ?? null}
          leaderboard={scoreListLeaderboard(
            board.map((row) =>
              'name' in row ? { name: row.name, score: row.score } : { name: teamLabel(row.team), score: row.score }
            )
          )}
          notice={
            <WordRushBreakdown
              mode={mode}
              players={bootstrap.players}
              teamRows={teamRows}
              answers={answers}
              numTeams={numTeams}
              myPlayerId={bootstrap.myPlayerId ?? null}
            />
          }
        />
      </GameShell>
    )
  }

  const submitWord = async () => {
    const text = wordText.trim()
    if (!text || !bootstrap.myResumeToken) return
    setLastMessage(null)
    setSubmitError(null)
    setActing(true)
    try {
      const result = await postWordRushSubmit(bootstrap.code, bootstrap.myResumeToken, text)
      if (!result.correct) {
        // Keep the typed word so the player can fix it, red-ring the field, and
        // show the specific dictionary message (mirrors web allowRetry behaviour).
        setSubmitError(result.message ?? `"${text}" isn't in the dictionary for this letter pair`)
      } else {
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
    const parsed = Math.round(Number(minLengthText))
    const chosenMin =
      minLengthText.trim() && Number.isFinite(parsed) ? Math.min(20, Math.max(minLength, parsed)) : minLength
    await act(() =>
      postWordRushPrompt(bootstrap.code, bootstrap.myResumeToken!, startLetter.trim(), endLetter.trim(), chosenMin)
    )
    setStartLetter('')
    setEndLetter('')
    setMinLengthText('')
  }

  // In individual + manual prompt mode the prompt-setter does NOT guess this
  // round — they earn mirror points from other players' scores instead.
  const isIndividualManualSetter = mode === 'individual' && isPromptSetter && session.prompt_mode === 'manual'
  // Individual mode is one-word-per-round: once you land a correct word this
  // turn the input is replaced by a "locked in" card (mirrors web).
  const myCorrectAnswerThisRound =
    mode === 'individual' && bootstrap.myPlayerId
      ? answers.find((a) => a.player_id === bootstrap.myPlayerId && a.correct && a.turn_index === session.turn_index)
      : undefined
  const canAnswer =
    !isViewer &&
    !myCorrectAnswerThisRound &&
    ((mode === 'individual' && !isIndividualManualSetter) || (mode === 'team' && onMyTeam && !isPromptSetter))

  const teamRound =
    mode === 'team' && session ? currentTeamRoundNumber(session.turn_index, numTeams) : session.current_round

  return (
    <GameShell
      bootstrap={bootstrap}
      title={batch5GameLabel('word_rush')}
      subtitle={session.status_message ?? bootstrap.code}
    >
      <KeyboardAwareGameScroll contentContainerStyle={styles.content}>
        {isViewer && bootstrap.game && me && bootstrap.myPlayerId ? (
          <ViewerModeBanner
            gameCode={bootstrap.code}
            playerId={bootstrap.myPlayerId}
            game={bootstrap.game}
            player={me}
            players={bootstrap.players}
            onPromoted={() => void bootstrap.load()}
          />
        ) : null}
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
            embedded
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
          <View style={styles.promptBlock}>
            <View style={styles.promptDisplay}>
              <Text style={styles.promptLetter}>{session.start_letter.toUpperCase()}</Text>
              <Text style={styles.promptArrow}>→</Text>
              <Text style={styles.promptLetter}>{session.end_letter.toUpperCase()}</Text>
            </View>
            {(session.min_word_length ?? minLength) > 3 ? (
              <Text style={styles.minCallout}>Minimum {session.min_word_length ?? minLength} letters</Text>
            ) : null}
          </View>
        ) : null}

        {session.phase === 'awaiting_prompt' && isPromptSetter && !isViewer ? (
          <View style={styles.panel}>
            <Text style={styles.label}>Set the letter pair</Text>
            <View style={styles.row}>
              <TextInput
                style={styles.letterInput}
                value={startLetter}
                onChangeText={setStartLetter}
                placeholder="Start"
                placeholderTextColor={theme.textFaint}
                maxLength={1}
                autoCapitalize="characters"
              />
              <Text style={styles.arrow}>→</Text>
              <TextInput
                style={styles.letterInput}
                value={endLetter}
                onChangeText={setEndLetter}
                placeholder="End"
                placeholderTextColor={theme.textFaint}
                maxLength={1}
                autoCapitalize="characters"
              />
            </View>
            <Text style={styles.hint}>Min letters (at least {minLength})</Text>
            <TextInput
              style={styles.input}
              value={minLengthText}
              onChangeText={setMinLengthText}
              placeholder={String(minLength)}
              placeholderTextColor={theme.textFaint}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Pressable style={styles.primaryBtn} disabled={acting} onPress={() => void setPrompt()}>
              <Text style={styles.primaryText}>Set prompt</Text>
            </Pressable>
          </View>
        ) : null}

        {session.phase === 'playing' && canAnswer ? (
          <View style={styles.panel}>
            <Text style={styles.hint}>
              Min {session.min_word_length ?? minLength} letters · starts & ends with shown letters
            </Text>
            <TextInput
              style={[styles.input, submitError ? styles.inputError : null]}
              value={wordText}
              onChangeText={(t) => {
                setWordText(t)
                if (submitError) setSubmitError(null)
              }}
              placeholder="Type a word"
              placeholderTextColor={theme.textFaint}
              onSubmitEditing={() => void submitWord()}
            />
            <Pressable style={styles.primaryBtn} disabled={acting} onPress={() => void submitWord()}>
              <Text style={styles.primaryText}>Submit</Text>
            </Pressable>
            {submitError ? <Text style={styles.errorFeedback}>{submitError}</Text> : null}
            {!submitError && lastMessage ? <Text style={styles.feedback}>{lastMessage}</Text> : null}
          </View>
        ) : session.phase === 'playing' && myCorrectAnswerThisRound ? (
          <View style={styles.lockedCard}>
            <Text style={styles.lockedTitle}>Correct — locked in for this round ✓</Text>
            <Text style={styles.lockedBody}>Waiting for other players…</Text>
          </View>
        ) : session.phase === 'playing' && isViewer ? (
          <Text style={styles.waiting}>
            {mode === 'team'
              ? `Watching — ${teamLabel(session.active_team)} is playing`
              : 'Watching — round in progress'}
          </Text>
        ) : session.phase === 'playing' && isIndividualManualSetter ? (
          <View style={styles.panel}>
            <Text style={styles.setterNote}>
              You set the letters this round — others are guessing. You earn mirror points from their scores.
            </Text>
          </View>
        ) : session.phase === 'playing' ? (
          <Text style={styles.waiting}>Watch and wait for your turn…</Text>
        ) : null}

        {mode === 'team' && session.phase === 'playing' ? (
          <ActivityFeed embedded title="Recent correct" items={recentCorrect} emptyText="No correct words yet" />
        ) : null}
      </KeyboardAwareGameScroll>
    </GameShell>
  )
}

/** Each player's correct words with the round + letter pair (e.g. "GLORY  R2 · G…Y"). */
function WordRushCorrectWords({
  answers,
  emptyLabel = 'No correct words',
}: {
  answers: WordRushAnswer[]
  emptyLabel?: string
}) {
  const styles = useThemedStyles(makeBreakdownStyles)
  const correct = useMemo(
    () => answers.filter((a) => a.correct).sort((a, b) => a.round - b.round || a.text.localeCompare(b.text)),
    [answers]
  )
  if (correct.length === 0) return <Text style={styles.empty}>{emptyLabel}</Text>
  return (
    <View style={styles.wordList}>
      {correct.map((a, index) => (
        <View key={`${a.round}-${a.text}-${index}`} style={styles.wordRow}>
          <Text style={styles.wordText}>{a.text.toUpperCase()}</Text>
          <Text style={styles.wordMeta}>
            R{a.round} · {a.start_letter.toUpperCase()}…{a.end_letter.toUpperCase()}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** Expandable per-player (or per-team) correct-word breakdown for the finished screen. */
function WordRushBreakdown({
  mode,
  players,
  teamRows,
  answers,
  numTeams,
  myPlayerId,
}: {
  mode: 'team' | 'individual'
  players: Player[]
  teamRows: WordRushPlayer[]
  answers: WordRushAnswer[]
  numTeams: number
  myPlayerId: string | null
}) {
  const styles = useThemedStyles(makeBreakdownStyles)
  const [expanded, setExpanded] = useState<string | null>(null)
  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players])

  const rows = useMemo(() => {
    if (mode === 'individual') {
      return computeWordRushPlayerScores(players, teamRows).map((r) => ({
        key: r.id,
        title: r.name,
        score: `${r.score} ${r.score === 1 ? 'pt' : 'pts'}`,
        mine: r.id === myPlayerId,
      }))
    }
    return computeWordRushTeamScores(answers, numTeams).map((r) => ({
      key: `team-${r.team}`,
      title: teamLabel(r.team),
      score: `${r.score} ${r.score === 1 ? 'word' : 'words'}`,
      mine: false,
    }))
  }, [mode, players, teamRows, answers, numTeams, myPlayerId])

  const renderMembers = (team: number) => {
    const memberIds = teamRows.filter((row) => row.team === team).map((row) => row.player_id)
    if (memberIds.length === 0) return <Text style={styles.empty}>No players on this team</Text>
    return (
      <View style={styles.memberList}>
        {memberIds.map((pid) => (
          <View key={pid} style={styles.member}>
            <Text style={styles.memberName}>{nameById.get(pid) ?? 'Player'}</Text>
            <WordRushCorrectWords answers={answers.filter((a) => a.player_id === pid)} emptyLabel="No words" />
          </View>
        ))}
      </View>
    )
  }

  if (rows.length === 0) return null

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Correct words</Text>
      {rows.map((row) => {
        const isOpen = expanded === row.key
        return (
          <View key={row.key} style={styles.rowWrap}>
            <Pressable style={styles.rowHeader} onPress={() => setExpanded(isOpen ? null : row.key)}>
              <Text style={[styles.rowTitle, row.mine && styles.rowTitleMine]} numberOfLines={1}>
                {row.title}
              </Text>
              <View style={styles.rowRight}>
                <Text style={styles.rowScore}>{row.score}</Text>
                <Text style={styles.chevron}>{isOpen ? '▾' : '▸'}</Text>
              </View>
            </Pressable>
            {isOpen ? (
              <View style={styles.rowBody}>
                {mode === 'individual' ? (
                  <WordRushCorrectWords answers={answers.filter((a) => a.player_id === row.key)} />
                ) : (
                  renderMembers(Number(row.key.replace('team-', '')))
                )}
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const makeBreakdownStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { backgroundColor: theme.surface, borderRadius: 12, padding: 12, gap: 4 },
    heading: { color: theme.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 4 },
    rowWrap: { borderTopWidth: 1, borderTopColor: theme.border },
    rowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      gap: 8,
    },
    rowTitle: { color: theme.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
    rowTitleMine: { color: theme.primary },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowScore: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
    chevron: { color: theme.textFaint, fontSize: 14, width: 14, textAlign: 'center' },
    rowBody: { paddingBottom: 10, paddingLeft: 4 },
    wordList: { gap: 6 },
    wordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    wordText: { color: theme.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
    wordMeta: { color: theme.textFaint, fontSize: 12 },
    empty: { color: theme.textFaint, fontSize: 13 },
    memberList: { gap: 10 },
    member: { gap: 4 },
    memberName: { color: theme.text, fontSize: 13, fontWeight: '700' },
  })

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    teamRowLabel: { color: theme.textMuted, fontSize: 14 },
    content: { paddingBottom: 32, gap: 14 },
    promptBlock: { alignItems: 'center', gap: 4, paddingVertical: 4 },
    promptDisplay: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      paddingVertical: 12,
    },
    promptLetter: { color: theme.text, fontSize: 40, fontWeight: '900' },
    promptArrow: { color: theme.primaryMuted, fontSize: 28, fontWeight: '700' },
    minCallout: {
      color: theme.primaryMuted,
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    inputError: { borderColor: theme.error },
    errorFeedback: { color: theme.error, textAlign: 'center', fontWeight: '600' },
    lockedCard: {
      backgroundColor: theme.primarySoft,
      borderWidth: 1,
      borderColor: theme.primary,
      borderRadius: 12,
      padding: 16,
      gap: 4,
      alignItems: 'center',
    },
    lockedTitle: { color: theme.primaryMuted, fontSize: 16, fontWeight: '800', textAlign: 'center' },
    lockedBody: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
    waiting: { color: theme.textMuted, fontSize: 16, textAlign: 'center', marginTop: 24 },
    panel: { backgroundColor: theme.surface, borderRadius: 12, padding: 16, gap: 10 },
    label: { color: theme.text, fontSize: 16, fontWeight: '600' },
    hint: { color: theme.textMuted, fontSize: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    letterInput: {
      flex: 1,
      backgroundColor: theme.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.text,
      padding: 12,
      fontSize: 24,
      textAlign: 'center',
    },
    arrow: { color: theme.text, fontSize: 24 },
    input: {
      backgroundColor: theme.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.text,
      padding: 12,
      fontSize: 16,
    },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      padding: 14,
      alignItems: 'center',
    },
    // White on the solid primary button — intentional (case 2).
    primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    feedback: { color: '#fbbf24', textAlign: 'center' },
    setterNote: { color: theme.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  })
