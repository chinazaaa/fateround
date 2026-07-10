import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { type Game, type Player, type Round, type TriviaAnswer } from '@fateround/shared'
import { tallyTriviaPlayerScores } from '@fateround/shared/trivia'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { TriviaActiveRound } from '@/components/games/trivia/TriviaActiveRound'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, TRIVIA_ANSWER_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { scoreListLeaderboard } from '@/lib/finish-leaderboards'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

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
    if (!playerId) return 'join'
    if (game.status === 'waiting') return 'waiting'
    if (game.status === 'finished') return 'finished'
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
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game || !bootstrap.myPlayerId) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const scores = tallyTriviaPlayerScores(answers, bootstrap.players)
    const top = scores[0]
    return (
      <GameShell bootstrap={bootstrap} title="Trivia" subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title="Game over"
          subtitle="Final standings"
          detail={top ? `${top.name} wins with ${top.score} pts` : undefined}
          leaderboard={scoreListLeaderboard(scores.map((row) => ({ name: row.name, score: row.score })))}
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
        onReload={() => bootstrap.load()}
      />
    </GameShell>
  )
}
