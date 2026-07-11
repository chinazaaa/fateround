import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  boardInPlay,
  checkOverallWinner,
  markForPlayer,
  subBoardCells,
} from '@fateround/shared/tic-tac-toe'
import { currentTurnPlayerId } from '@fateround/shared/tic-tac-toe'
import type { Game, Player, TicTacToeMark, TicTacToeSession } from '@fateround/shared'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { postTicTacToeMove } from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { TIC_TAC_TOE_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { winnerLeaderboard } from '@/lib/finish-leaderboards'

type Screen = 'loading' | 'join' | 'waiting' | 'active' | 'finished' | 'not_found'

function markGlyph(value: TicTacToeMark | null): string {
  return value === 'X' ? '✕' : value === 'O' ? '○' : ''
}

export function TicTacToePlayerView({ gameCode }: { gameCode: string }) {
  const [session, setSession] = useState<TicTacToeSession | null>(null)
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: TicTacToeSession | null; ok: boolean }> => {
      const res = await getSupabase()
        .from('tic_tac_toe_sessions')
        .select(TIC_TAC_TOE_SESSION_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .maybeSingle()
      const data = (res.data as TicTacToeSession | null) ?? null
      if (data) setSession(data)
      return { state: data, ok: !res.error }
    },
    [gameCode]
  )

  const computeScreen = useCallback(
    (game: Game, playerId: string | null, sessionData: TicTacToeSession | null): Screen => {
      if (!playerId) return game.status === 'waiting' ? 'join' : 'join'
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'active' && sessionData?.status !== 'finished') return 'active'
      if (game.status === 'finished' || sessionData?.status === 'finished') return 'finished'
      return 'waiting'
    },
    []
  )

  const bootstrap = useGameViewBootstrap<Screen, TicTacToeSession | null>({
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
    ['players', { table: 'games', column: 'id' }, 'tic_tac_toe_sessions'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const activeSessionEarly = session ?? bootstrap.gameState
  const turnPlayerIdEarly = activeSessionEarly ? currentTurnPlayerId(activeSessionEarly) : null
  const isMyTurnEarly = bootstrap.myPlayerId != null && turnPlayerIdEarly === bootstrap.myPlayerId

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn: isMyTurnEarly,
    enabled: bootstrap.screen === 'active',
  })

  const move = async (cellIndex: number) => {
    if (!bootstrap.myResumeToken) return
    setActing(true)
    try {
      playSound('move')
      await postTicTacToeMove(bootstrap.code, bootstrap.myResumeToken, cellIndex)
      await bootstrap.load()
    } catch (err) {
      bootstrap.setScreen('active')
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

  const activeSession = session ?? bootstrap.gameState
  if (!bootstrap.game || !activeSession) return <GameLoading />

  const turnPlayerId = currentTurnPlayerId(activeSession)
  const isMyTurn = bootstrap.myPlayerId === turnPlayerId

  const myMark = bootstrap.myPlayerId ? markForPlayer(activeSession, bootstrap.myPlayerId) : null
  const turnPlayer = bootstrap.players.find((p) => p.id === turnPlayerId)

  if (bootstrap.screen === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === activeSession.winner_player_id)
    const title = activeSession.is_draw ? 'Draw!' : winner ? `${winner.name} wins!` : 'Game over'
    return (
      <GameShell bootstrap={bootstrap} title="Tic Tac Toe" subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title={title} subtitle="Final standings" detail={activeSession.status_message} leaderboard={activeSession.is_draw ? undefined : winnerLeaderboard(activeSession.winner_player_id, bootstrap.players, bootstrap.myPlayerId)} winnerPlayerId={activeSession.winner_player_id} roundKey={activeSession.id} />
      </GameShell>
    )
  }

  const overallWin = checkOverallWinner(activeSession.board_winners ?? [])
  const winLine = new Set(overallWin?.line ?? [])

  return (
    <GameShell bootstrap={bootstrap} title="Tic Tac Toe" subtitle={`Code ${bootstrap.code}`}>
      <TurnBanner
        text={isMyTurn ? 'Your turn' : `${turnPlayer?.name ?? 'Opponent'}'s turn`}
        isMyTurn={isMyTurn}
      />
      <View style={styles.metaRow}>
        <PlayerChip label={markGlyph('X')} name={playerName(bootstrap.players, activeSession.player_x_id)} />
        <PlayerChip label={markGlyph('O')} name={playerName(bootstrap.players, activeSession.player_o_id)} />
      </View>
      <View style={styles.boardGrid}>
        {Array.from({ length: 9 }, (_, boardIndex) => (
          <View
            key={boardIndex}
            style={[
              styles.subBoard,
              boardInPlay(activeSession, boardIndex) && styles.subBoardActive,
              winLine.has(boardIndex) && styles.subBoardWin,
            ]}
          >
            <View style={styles.cellGrid}>
              {subBoardCells(activeSession.board, boardIndex).map((cell, pos) => {
                const globalIndex = boardIndex * 9 + pos
                const playable =
                  isMyTurn &&
                  !acting &&
                  boardInPlay(activeSession, boardIndex) &&
                  !cell &&
                  activeSession.board_winners[boardIndex] == null
                return (
                  <Pressable
                    key={pos}
                    style={[styles.cell, playable && styles.cellPlayable]}
                    disabled={!playable}
                    onPress={() => void move(globalIndex)}
                  >
                    <Text style={[styles.cellMark, cell === 'X' ? styles.markX : cell === 'O' ? styles.markO : null]}>
                      {markGlyph(cell)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ))}
      </View>
      {myMark ? <Text style={styles.youAre}>You are {markGlyph(myMark)}</Text> : null}
    </GameShell>
  )
}

function playerName(players: Player[], id: string): string {
  return players.find((p) => p.id === id)?.name ?? 'Player'
}

function PlayerChip({ label, name }: { label: string; name: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipMark}>{label}</Text>
      <Text style={styles.chipName}>{name}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    backgroundColor: '#17171d',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  chipMark: { color: '#fff', fontSize: 18, fontWeight: '800' },
  chipName: { color: '#9ca3af', fontSize: 12 },
  boardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  subBoard: {
    width: '31%',
    aspectRatio: 1,
    backgroundColor: '#17171d',
    borderRadius: 10,
    padding: 4,
    borderWidth: 2,
    borderColor: '#2a2a35',
  },
  subBoardActive: { borderColor: '#f43f5e' },
  subBoardWin: { borderColor: '#fbbf24' },
  cellGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  cell: {
    width: '31%',
    aspectRatio: 1,
    backgroundColor: '#0b0b0f',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellPlayable: { backgroundColor: '#1f2937' },
  cellMark: { fontSize: 16, fontWeight: '800', color: '#fff' },
  markX: { color: '#38bdf8' },
  markO: { color: '#fb923c' },
  youAre: { color: '#9ca3af', textAlign: 'center', fontSize: 14 },
})
