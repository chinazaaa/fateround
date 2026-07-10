import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colorForPlayer, isDarkSquare, pieceAt, currentTurnPlayerId } from '@fateround/shared/checkers'
import type { CheckersSession, Game, Player } from '@fateround/shared'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import {
  FinishedPanel,
  GameLoading,
  GameNotFound,
  GameShell,
  TurnBanner,
} from '@/components/game/GameChrome'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postCheckersMove } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { CHECKERS_SESSION_SELECT } from '@/lib/supabase-selects'

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

  useGameTableSync(
    gameCode,
    ['players', { table: 'games', column: 'id' }, 'checkers_sessions'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const activeSession = session ?? bootstrap.gameState
  const turnPlayerId = activeSession ? currentTurnPlayerId(activeSession) : null
  const isMyTurn = bootstrap.myPlayerId != null && turnPlayerId === bootstrap.myPlayerId
  const myColor = bootstrap.myPlayerId && activeSession ? colorForPlayer(activeSession, bootstrap.myPlayerId) : null

  const onSquarePress = async (row: number, col: number) => {
    if (!bootstrap.myResumeToken || !activeSession || !isMyTurn) return
    const sq = `${row}${col}`
    const piece = pieceAt(activeSession.board, row, col)
    const pieceColor = piece === 'r' || piece === 'R' ? 'r' : piece === 'b' || piece === 'B' ? 'b' : null

    if (!selected) {
      if (pieceColor === myColor) setSelected(sq)
      return
    }

    if (pieceColor === myColor && sq !== selected) {
      setSelected(sq)
      return
    }

    setActing(true)
    try {
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
  if (bootstrap.screen === 'waiting' && bootstrap.game) {
    return <LobbyView game={bootstrap.game} players={bootstrap.players} myPlayerId={bootstrap.myPlayerId} />
  }
  if (!bootstrap.game || !activeSession) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === activeSession.winner_player_id)
    const title = activeSession.is_draw ? 'Draw!' : winner ? `${winner.name} wins!` : 'Game over'
    return (
      <GameShell title="Checkers" subtitle={bootstrap.code}>
        <FinishedPanel title={title} detail={activeSession.status_message} />
      </GameShell>
    )
  }

  const turnPlayer = bootstrap.players.find((p) => p.id === turnPlayerId)

  return (
    <GameShell title="Checkers" subtitle={`Code ${bootstrap.code}`}>
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
      <View style={styles.board}>
        {Array.from({ length: 8 }, (_, row) => (
          <View key={row} style={styles.row}>
            {Array.from({ length: 8 }, (_, col) => {
              const dark = isDarkSquare(row, col)
              const piece = pieceAt(activeSession.board, row, col)
              const sq = `${row}${col}`
              const isSelected = selected === sq
              return (
                <Pressable
                  key={col}
                  style={[
                    styles.square,
                    dark ? styles.darkSquare : styles.lightSquare,
                    isSelected && styles.selectedSquare,
                  ]}
                  disabled={!dark || acting || !isMyTurn}
                  onPress={() => void onSquarePress(row, col)}
                >
                  {dark && piece !== '.' ? (
                    <Text style={[styles.piece, pieceColorStyle(piece)]}>{pieceGlyph(piece)}</Text>
                  ) : null}
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
    </GameShell>
  )
}

function pieceGlyph(piece: string): string {
  if (piece === 'r' || piece === 'R') return piece === 'R' ? '♔' : '●'
  if (piece === 'b' || piece === 'B') return piece === 'B' ? '♚' : '●'
  return ''
}

function pieceColorStyle(piece: string) {
  if (piece === 'r' || piece === 'R') return styles.redPiece
  return styles.blackPiece
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', borderWidth: 2, borderColor: '#2a2a35', borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  square: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  lightSquare: { backgroundColor: '#f5e6c8' },
  darkSquare: { backgroundColor: '#8b5e34' },
  selectedSquare: { borderWidth: 2, borderColor: '#f43f5e' },
  piece: { fontSize: 18, fontWeight: '800' },
  redPiece: { color: '#dc2626' },
  blackPiece: { color: '#111827' },
})
