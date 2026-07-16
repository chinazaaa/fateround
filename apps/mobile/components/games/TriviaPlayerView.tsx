import { useCallback, useState } from 'react'
import { type Game, type Player, type Round, type TriviaAnswer } from '@fateround/shared'
import { tallyTriviaPlayerScores } from '@fateround/shared/trivia'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { LateJoinChoiceScreen } from '@/components/lifecycle/LateJoinChoiceScreen'
import { TriviaActiveRound } from '@/components/games/trivia/TriviaActiveRound'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, TRIVIA_ANSWER_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { triviaLeaderboard } from '@/lib/finish-leaderboards'

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

export function TriviaPlayerView({ gameCode }: { gameCode: string }) {
  const [rounds, setRounds] = useState<Round[]>([])
  const [answers, setAnswers] = useState<TriviaAnswer[]>([])

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: null; ok: boolean }> => {
      const [roundsRes, answersRes] = await Promise.all([
        getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', gameCode.toUpperCase()).order('round_number'),
        getSupabase().from('trivia_answers').select(TRIVIA_ANSWER_SELECT).eq('game_id', gameCode.toUpperCase()),
      ])
      if (roundsRes.error || answersRes.error) return { state: null, ok: false }
      setRounds((roundsRes.data as Round[]) ?? [])
      setAnswers((answersRes.data as TriviaAnswer[]) ?? [])
      return { state: null, ok: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null): Screen => {
    // Resolve the no-identity case BEFORE 'finished' — the finished render needs a
    // seated player (myPlayerId), so a non-participant opening a finished link would
    // otherwise get stuck on GameLoading. Route them to the game_ended screen.
    if (!playerId) {
      const pre = preJoinScreen(game, false)
      if (pre === 'game_ended') return 'game_ended'
      // Viewers disabled mid-game → "game in progress, wait for the next lobby".
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      // Late opener with viewers allowed: offer watch-or-play instead of a bare join.
      if (pre === 'late_join_choice') return 'late_join_choice'
      return 'join'
    }
    if (game.status === 'finished') return 'finished'
    if (game.status === 'waiting') return 'waiting'
    return 'playing'
  }, [])

  const bootstrap = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen,
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  // Watch-or-play prompt for a late opener (fetched only on that screen).
  const lateJoin = useLateJoinContext(gameCode, bootstrap.game, bootstrap.screen === 'late_join_choice')

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'trivia_answers'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    enabled: bootstrap.screen === 'playing',
    startMessage: 'Trivia started! 🎮',
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
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game || !bootstrap.myPlayerId) return <GameLoading />

  const me = bootstrap.players.find((p) => p.id === bootstrap.myPlayerId)
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))

  if (bootstrap.screen === 'finished') {
    const scores = tallyTriviaPlayerScores(answers, bootstrap.players)
    const top = scores[0]
    // Top scorer posts to the community leaderboard (GameFinishPanel only fires
    // when the local player is the winner). Ignore a 0-point "win".
    const winnerPlayerId = top && top.score > 0 ? top.id : null
    return (
      <GameShell bootstrap={bootstrap} title="Trivia" subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={top && top.score > 0 ? `${top.name} wins!` : 'Game over'}
          emoji={top && top.score > 0 ? '🏆' : '🏁'}
          subtitle="Final standings"
          detail={top ? `${top.name} wins with ${top.score} pts` : undefined}
          leaderboard={triviaLeaderboard(scores, bootstrap.game?.rounds_count, bootstrap.myPlayerId)}
          winnerPlayerId={winnerPlayerId}
          roundKey={bootstrap.game?.session_started_at ?? null}
        />
      </GameShell>
    )
  }

  return (
    <GameShell bootstrap={bootstrap} title="Trivia" subtitle={`Code ${bootstrap.code}`}>
      <TriviaActiveRound
        gameCode={bootstrap.code}
        game={bootstrap.game}
        players={bootstrap.players}
        rounds={rounds}
        answers={answers}
        myPlayerId={bootstrap.myPlayerId}
        myResumeToken={bootstrap.myResumeToken}
        playerName={me?.name}
        readOnly={isViewer}
        onReload={() => bootstrap.load()}
      />
    </GameShell>
  )
}
