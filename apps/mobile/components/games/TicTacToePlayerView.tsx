import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  boardInPlay,
  checkOverallWinner,
  markForPlayer,
  subBoardCells,
} from '@fateround/shared/tic-tac-toe'
import { currentTurnPlayerId } from '@fateround/shared/tic-tac-toe'
import { playerIsViewer } from '@fateround/shared/viewers'
import type { Game, Player, TicTacToeBoardResult, TicTacToeMark, TicTacToeSession } from '@fateround/shared'
import { useTicTacToeTurnTimer } from './tic-tac-toe/useTicTacToeTurnTimer'
import { TicTacToeFinalBoardRecap } from './tic-tac-toe/TicTacToeFinalBoardRecap'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
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
  const styles = useThemedStyles(makeStyles)
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

  // A late joiner / spectator watches read-only: no seat, board locked, and turn
  // notifications suppressed (mirrors web's isViewer handling).
  const meEarly = bootstrap.myPlayerId ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) : undefined
  const isViewer = !!(bootstrap.game && meEarly && playerIsViewer(meEarly, bootstrap.game))

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn: isViewer ? false : isMyTurnEarly,
    enabled: bootstrap.screen === 'active' && !isViewer,
  })

  // Live per-turn countdown. Any client may drive the expiry poke (server
  // re-checks the deadline), so we enable it whenever this table is active.
  const { secondsLeft, hasTimer, urgent } = useTicTacToeTurnTimer(
    bootstrap.code,
    activeSessionEarly,
    bootstrap.screen === 'active',
    bootstrap.load
  )

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
        <GameFinishPanel bootstrap={bootstrap} title={title} subtitle="Final standings" detail={activeSession.status_message} leaderboard={activeSession.is_draw ? undefined : winnerLeaderboard(activeSession.winner_player_id, bootstrap.players, bootstrap.myPlayerId)} winnerPlayerId={activeSession.winner_player_id} roundKey={activeSession.id} notice={<TicTacToeFinalBoardRecap session={activeSession} players={bootstrap.players} myPlayerId={bootstrap.myPlayerId} />} />
      </GameShell>
    )
  }

  const overallWin = checkOverallWinner(activeSession.board_winners ?? [])
  const winLine = new Set(overallWin?.line ?? [])

  return (
    <GameShell bootstrap={bootstrap} title="Tic Tac Toe" subtitle={`Code ${bootstrap.code}`}>
      <TicTacToeTurnBar
        text={isMyTurn ? 'Your turn' : `${turnPlayer?.name ?? 'Opponent'}'s turn`}
        isMyTurn={isMyTurn}
        secondsLeft={secondsLeft}
        hasTimer={hasTimer}
        urgent={urgent}
      />
      <View style={styles.metaRow}>
        <PlayerChip label={markGlyph('X')} name={playerName(bootstrap.players, activeSession.player_x_id)} />
        <PlayerChip label={markGlyph('O')} name={playerName(bootstrap.players, activeSession.player_o_id)} />
      </View>
      <View style={styles.boardGrid}>
        {Array.from({ length: 9 }, (_, boardIndex) => {
          const result: TicTacToeBoardResult = activeSession.board_winners[boardIndex] ?? null
          const decided = result != null
          return (
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
                    !isViewer &&
                    !acting &&
                    boardInPlay(activeSession, boardIndex) &&
                    !cell &&
                    !decided
                  return (
                    <Pressable
                      key={pos}
                      style={[styles.cell, playable && styles.cellPlayable, decided && styles.cellDim]}
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
              {decided ? (
                <View style={styles.decidedOverlay} pointerEvents="none">
                  {result === 'draw' ? (
                    <Text style={styles.decidedDraw}>🤝</Text>
                  ) : (
                    <Text style={[styles.decidedMark, result === 'X' ? styles.markX : styles.markO]}>
                      {markGlyph(result)}
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
          )
        })}
      </View>
      {myMark ? (
        <Text style={styles.youAre}>
          You are <Text style={styles.youAreMark}>{markGlyph(myMark)}</Text> ·{' '}
          {isMyTurn
            ? activeSession.active_board == null
              ? 'play in any open board'
              : 'play in the highlighted board'
            : 'waiting for your opponent'}
        </Text>
      ) : null}
    </GameShell>
  )
}

function playerName(players: Player[], id: string): string {
  return players.find((p) => p.id === id)?.name ?? 'Player'
}

function TicTacToeTurnBar({
  text,
  isMyTurn,
  secondsLeft,
  hasTimer,
  urgent,
}: {
  text: string
  isMyTurn: boolean
  secondsLeft: number
  hasTimer: boolean
  urgent: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={[styles.turnBar, isMyTurn && styles.turnBarMine, urgent && styles.turnBarUrgent]}>
      <Text style={styles.turnBarText}>{text}</Text>
      {hasTimer && secondsLeft > 0 ? (
        <Text style={[styles.turnBarSeconds, urgent && styles.turnBarSecondsUrgent]}>{secondsLeft}s</Text>
      ) : null}
    </View>
  )
}

function PlayerChip({ label, name }: { label: string; name: string }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.chip}>
      <Text style={styles.chipMark}>{label}</Text>
      <Text style={styles.chipName}>{name}</Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  metaRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  chipMark: { color: theme.text, fontSize: 18, fontWeight: '800' },
  chipName: { color: theme.textMuted, fontSize: 12 },
  boardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  subBoard: {
    width: '31%',
    aspectRatio: 1,
    backgroundColor: theme.surface,
    borderRadius: 10,
    padding: 4,
    borderWidth: 2,
    borderColor: theme.border,
  },
  subBoardActive: { borderColor: theme.primary },
  subBoardWin: { borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.15)' },
  cellGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  // A decided sub-board dims its small cells and overlays a big winning glyph so
  // the meta-board reads at a glance (mirrors web's SubBoard decided overlay).
  cellDim: { opacity: 0.4 },
  decidedOverlay: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    // Translucent scrim over the dimmed cells; fixed rgba works in both schemes.
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  decidedMark: { fontSize: 48, fontWeight: '900' },
  decidedDraw: { fontSize: 34 },
  cell: {
    width: '31%',
    aspectRatio: 1,
    backgroundColor: theme.bg,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellPlayable: { backgroundColor: '#1f2937' },
  // Base mark color; X/O override with markX/markO below. On a dark slate playable
  // cell (#1f2937) when shown — white on colored cell, intentional.
  cellMark: { fontSize: 16, fontWeight: '800', color: '#fff' },
  markX: { color: '#38bdf8' },
  markO: { color: '#fb923c' },
  youAre: { color: theme.textMuted, textAlign: 'center', fontSize: 13 },
  youAreMark: { color: theme.text, fontWeight: '800' },
  turnBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  turnBarMine: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  turnBarUrgent: {
    // Amber urgent state, matches web's turn bar. Fixed color, both schemes.
    borderColor: 'rgba(251,191,36,0.6)',
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  turnBarText: { color: theme.text, fontSize: 16, fontWeight: '700' },
  turnBarSeconds: { color: theme.text, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  turnBarSecondsUrgent: { color: '#f59e0b' },
})
