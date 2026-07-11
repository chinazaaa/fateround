import { useCallback, useState } from 'react'
import { Text } from 'react-native'
import { colorForPlayer, currentTurnPlayerId, legalStepsFromSquare } from '@fateround/shared/checkers'
import { CheckersBoard } from '@/components/games/checkers/CheckersBoard'
import type { CheckersSession, Game, Player } from '@fateround/shared'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { postCheckersMove } from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { CHECKERS_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { winnerLeaderboard } from '@/lib/finish-leaderboards'

type Screen = 'loading' | 'join' | 'waiting' | 'active' | 'finished' | 'not_found'

export function CheckersPlayerView({ gameCode }: { gameCode: string }) {
  const [session, setSession] = useState<CheckersSession | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: CheckersSession | null; ok: boolean }> => {
      const res = await getSupabase()
        .from('checkers_sessions')
        .select(CHECKERS_SESSION_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .maybeSingle()
      const data = (res.data as CheckersSession | null) ?? null
      if (data) setSession(data)
      return { state: data, ok: !res.error }
    },
    [gameCode]
  )

  const computeScreen = useCallback(
    (game: Game, playerId: string | null, sessionData: CheckersSession | null): Screen => {
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'active' && sessionData?.status !== 'finished') return 'active'
      if (game.status === 'finished' || sessionData?.status === 'finished') return 'finished'
      return 'waiting'
    },
    []
  )

  const bootstrap = useGameViewBootstrap<Screen, CheckersSession | null>({
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
    ['players', { table: 'games', column: 'id' }, 'checkers_sessions'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const activeSession = session ?? bootstrap.gameState
  const turnPlayerId = activeSession ? currentTurnPlayerId(activeSession) : null
  const isMyTurn = bootstrap.myPlayerId != null && turnPlayerId === bootstrap.myPlayerId

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'active',
  })

  const myColor = bootstrap.myPlayerId && activeSession ? colorForPlayer(activeSession, bootstrap.myPlayerId) : null

  const onSquarePress = async (row: number, col: number) => {
    if (!bootstrap.myResumeToken || !activeSession || !isMyTurn || !myColor) return
    const sq = `${row}${col}`
    const mustContinue = activeSession.must_continue_from
    const legalTargets = new Set(
      selected
        ? legalStepsFromSquare(activeSession.board, myColor, selected, mustContinue).map((step) => step.to)
        : []
    )

    if (!selected) {
      const steps = legalStepsFromSquare(activeSession.board, myColor, sq, mustContinue)
      if (steps.length > 0) setSelected(sq)
      return
    }

    if (sq !== selected && !legalTargets.has(sq)) {
      const steps = legalStepsFromSquare(activeSession.board, myColor, sq, mustContinue)
      if (steps.length > 0) setSelected(sq)
      return
    }

    if (!legalTargets.has(sq)) return

    setActing(true)
    try {
      playSound('move')
      await postCheckersMove(bootstrap.code, bootstrap.myResumeToken, selected, sq)
      setSelected(null)
      await bootstrap.load()
    } catch {
      setSelected(null)
    } finally {
      setActing(false)
    }
  }

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
  if (!bootstrap.game || !activeSession) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === activeSession.winner_player_id)
    const title = activeSession.is_draw ? 'Draw!' : winner ? `${winner.name} wins!` : 'Game over'
    return (
      <GameShell bootstrap={bootstrap} title="Checkers" subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title={title} subtitle="Final standings" detail={activeSession.status_message} leaderboard={activeSession.is_draw ? undefined : winnerLeaderboard(activeSession.winner_player_id, bootstrap.players, bootstrap.myPlayerId)} winnerPlayerId={activeSession.winner_player_id} roundKey={activeSession.id} />
      </GameShell>
    )
  }

  const turnPlayer = bootstrap.players.find((p) => p.id === turnPlayerId)

  return (
    <GameShell bootstrap={bootstrap} title="Checkers" subtitle={`Code ${bootstrap.code}`}>
      <TurnBanner
        text={
          selected
            ? `Selected ${selected} — tap destination`
            : isMyTurn
              ? 'Your turn — tap a piece'
              : `${turnPlayer?.name ?? 'Opponent'}'s turn`
        }
        isMyTurn={isMyTurn}
      />
      <CheckersBoard
        board={activeSession.board}
        myColor={myColor}
        isMyTurn={isMyTurn}
        mustContinue={activeSession.must_continue_from}
        selected={selected}
        lastMoveFrom={null}
        lastMoveTo={null}
        acting={acting}
        onSquarePress={(row, col) => void onSquarePress(row, col)}
      />
    </GameShell>
  )
}
