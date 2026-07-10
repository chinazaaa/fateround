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
  TEAM_EMOJI,
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
import { FinishedPanel, GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
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

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function DescribeItPlayerView({ gameCode }: { gameCode: string }) {
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

  if (bootstrap.screen === 'waiting' && bootstrap.game) {
    if (mode === 'individual') {
      return <LobbyView game={bootstrap.game} players={bootstrap.players} myPlayerId={bootstrap.myPlayerId} />
    }
    return (
      <GameShell title={batch4GameLabel('describe_it')} subtitle="Pick your team">
        <Text style={styles.help}>Choose a team before the host starts.</Text>
        <View style={styles.teamGrid}>
          {Array.from({ length: numTeams }, (_, i) => i + 1).map((team) => (
            <Pressable
              key={team}
              style={[styles.teamBtn, myTeamRow?.team === team && styles.teamBtnActive]}
              disabled={acting}
              onPress={() => void pickTeam(team)}
            >
              <Text style={styles.teamEmoji}>{TEAM_EMOJI[team - 1] ?? '⬜'}</Text>
              <Text style={styles.teamText}>{teamLabel(team)}</Text>
              <Text style={styles.teamCount}>{teamCounts[team] ?? 0} players</Text>
            </Pressable>
          ))}
        </View>
      </GameShell>
    )
  }

  if (!bootstrap.game || !session) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    if (mode === 'individual') {
      const board = describeItIndividualLeaderboard(teamRows, bootstrap.players)
      const top = board[0]
      return (
        <GameShell title={batch4GameLabel('describe_it')} subtitle={bootstrap.code}>
          <FinishedPanel title="Final results" detail={top ? `${top.name} — ${top.score} pts` : undefined} />
        </GameShell>
      )
    }
    const scores = computeDescribeItScores(words, numTeams)
    const winners = describeItWinningTeams(scores)
    const winnerLabel = winners.map((t) => teamLabel(t)).join(', ')
    return (
      <GameShell title={batch4GameLabel('describe_it')} subtitle={bootstrap.code}>
        <FinishedPanel title="Final results" detail={winnerLabel ? `${winnerLabel} wins` : undefined} />
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
    >
      <TurnBanner text={statusText} isMyTurn={isDescriber || canGuess} />

      {session.phase === 'break' ? (
        <Text style={styles.waiting}>Break time — hang tight…</Text>
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
                placeholderTextColor="#6b7280"
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
                placeholderTextColor="#6b7280"
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
        </>
      )}
    </GameShell>
  )
}

const styles = StyleSheet.create({
  help: { color: '#d1d5db', fontSize: 15, marginBottom: 8 },
  teamGrid: { gap: 10 },
  teamBtn: {
    backgroundColor: '#17171d',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a35',
    gap: 4,
  },
  teamBtnActive: { borderColor: '#f43f5e', backgroundColor: '#3f1d2b' },
  teamEmoji: { fontSize: 22 },
  teamText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  teamCount: { color: '#9ca3af', fontSize: 14 },
  waiting: { color: '#9ca3af', fontSize: 16, textAlign: 'center', marginTop: 24 },
  panel: { backgroundColor: '#17171d', borderRadius: 12, padding: 16, gap: 12 },
  wordLabel: { color: '#9ca3af', fontSize: 13 },
  word: { color: '#fff', fontSize: 28, fontWeight: '800' },
  clueList: { gap: 6 },
  clueScroll: { maxHeight: 120 },
  clueItem: { color: '#d1d5db', fontSize: 15, lineHeight: 22 },
  input: {
    backgroundColor: '#0b0b0f',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a35',
    color: '#fff',
    padding: 12,
    fontSize: 16,
  },
  row: { flexDirection: 'row', gap: 8 },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#f43f5e',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    backgroundColor: '#2a2a35',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  secondaryText: { color: '#fff', fontWeight: '600', fontSize: 15 },
})
