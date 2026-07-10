import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  type Game,
  type Player,
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
  TEAM_EMOJI,
  teamLabel,
} from '@fateround/shared/quick-draw-guess'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { FinishedPanel, GameLoading, GameNotFound, GameShell, TurnBanner, WaitingPanel } from '@/components/game/GameChrome'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postQuickDrawGuess, postQuickDrawGuessSkip, postQuickDrawGuessTeam } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import {
  QUICK_DRAW_GUESS_GUESS_SELECT,
  QUICK_DRAW_GUESS_PLAYER_SELECT,
  QUICK_DRAW_GUESS_SESSION_SELECT,
  QUICK_DRAW_GUESS_WORD_SELECT,
} from '@/lib/supabase-selects'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function QuickDrawPlayerView({ gameCode }: { gameCode: string }) {
  const [session, setSession] = useState<QuickDrawGuessSession | null>(null)
  const [teamRows, setTeamRows] = useState<QuickDrawGuessPlayer[]>([])
  const [words, setWords] = useState<QuickDrawGuessWord[]>([])
  const [guesses, setGuesses] = useState<QuickDrawGuessGuess[]>([])
  const [guessText, setGuessText] = useState('')
  const [acting, setActing] = useState(false)

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

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />

  if (!isGuessMode && bootstrap.game) {
    return (
      <GameShell title={batch8GameLabel('quick_draw')} subtitle="Drawful mode">
        <WaitingPanel message="Drawful (lie) mode needs the web app for canvas drawing. Open this game in your browser to play that variant." />
      </GameShell>
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
      />
    )
  }

  if (bootstrap.screen === 'waiting' && bootstrap.game) {
    if (mode === 'individual') {
      return <LobbyView game={bootstrap.game} players={bootstrap.players} myPlayerId={bootstrap.myPlayerId} />
    }
    return (
      <GameShell title={batch8GameLabel('quick_draw')} subtitle="Pick your team">
        <Text style={styles.help}>Choose a team before the host starts.</Text>
        <View style={styles.teamGrid}>
          {Array.from({ length: numTeams }, (_, i) => i + 1).map((team) => (
            <Pressable
              key={team}
              style={[styles.teamBtn, myTeamRow?.team === team && styles.teamBtnActive]}
              disabled={acting}
              onPress={() => void act(() => postQuickDrawGuessTeam(bootstrap.code, bootstrap.myResumeToken!, team))}
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

  if (bootstrap.screen === 'finished' && bootstrap.game) {
    if (mode === 'individual') {
      const board = quickDrawGuessIndividualLeaderboard(teamRows, bootstrap.players)
      const top = board[0]
      return (
        <FinishedPanel title="Final results" detail={top ? `${top.name} — ${top.score} pts` : undefined} />
      )
    }
    const scores = computeQuickDrawGuessScores(words, numTeams)
    const winners = quickDrawGuessWinningTeams(scores)
    const winnerLabel = winners.map((t) => teamLabel(t)).join(' & ')
    return (
      <FinishedPanel title="Final results" detail={winnerLabel ? `${winnerLabel} wins` : undefined} />
    )
  }

  if (!bootstrap.game || !session) return <GameLoading />

  const drawerName = bootstrap.players.find((p) => p.id === session.drawer_player_id)?.name ?? 'Drawer'
  const statusText =
    session.phase === 'break'
      ? 'Round break'
      : isDrawer
        ? 'You are drawing — sketch on paper or describe verbally'
        : canGuess
          ? 'Guess the word!'
          : `${drawerName} is drawing`

  return (
    <GameShell title={batch8GameLabel('quick_draw')} subtitle={mode === 'team' ? teamLabel(session.active_team) : 'Individual'}>
      <ScrollView contentContainerStyle={styles.content}>
        <TurnBanner text={statusText} isMyTurn={isDrawer || canGuess} />

        {session.status_message ? <Text style={styles.status}>{session.status_message}</Text> : null}

        {isDrawer && session.current_word ? (
          <View style={styles.wordBox}>
            <Text style={styles.wordLabel}>Your word</Text>
            <Text style={styles.word}>{session.current_word}</Text>
            <Text style={styles.wordHint}>Draw on paper or describe without saying the word.</Text>
            <Pressable
              style={[styles.secondaryBtn, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => void act(() => postQuickDrawGuessSkip(bootstrap.code, bootstrap.myResumeToken!))}
            >
              <Text style={styles.secondaryBtnText}>Skip word</Text>
            </Pressable>
          </View>
        ) : null}

        {canGuess ? (
          <View style={styles.guessBox}>
            <TextInput
              style={styles.input}
              value={guessText}
              onChangeText={setGuessText}
              placeholder="Type your guess"
              placeholderTextColor="#6b7280"
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

        {guesses.length > 0 ? (
          <>
            <Text style={styles.section}>Recent guesses</Text>
            {guesses.slice(0, 8).map((g) => {
              const name = bootstrap.players.find((p) => p.id === g.player_id)?.name ?? 'Player'
              return (
                <Text key={g.id} style={[styles.guessLine, g.correct && styles.guessCorrect]}>
                  {name}: {g.text} {g.correct ? `+${g.points}` : ''}
                </Text>
              )
            })}
          </>
        ) : null}
      </ScrollView>
    </GameShell>
  )
}

const styles = StyleSheet.create({
  help: { color: '#9ca3af', fontSize: 15, marginBottom: 12 },
  teamGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  teamBtn: {
    width: '47%',
    backgroundColor: '#17171d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a35',
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  teamBtnActive: { borderColor: '#f43f5e' },
  teamEmoji: { fontSize: 22 },
  teamText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  teamCount: { color: '#9ca3af', fontSize: 12 },
  content: { paddingBottom: 32, gap: 12 },
  status: { color: '#d1d5db', fontSize: 14 },
  wordBox: { backgroundColor: '#17171d', borderRadius: 12, padding: 16, gap: 8, alignItems: 'center' },
  wordLabel: { color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' },
  word: { color: '#fff', fontSize: 32, fontWeight: '800', textAlign: 'center' },
  wordHint: { color: '#9ca3af', fontSize: 13, textAlign: 'center' },
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
  secondaryBtn: {
    backgroundColor: '#2a2a35',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  section: { color: '#fff', fontSize: 16, fontWeight: '600' },
  guessLine: { color: '#d1d5db', fontSize: 14 },
  guessCorrect: { color: '#86efac' },
})
