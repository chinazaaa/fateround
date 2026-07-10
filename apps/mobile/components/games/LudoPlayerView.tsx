import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { type LudoPlayerState, type LudoSession } from '@fateround/shared'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import {
  currentPlayerId,
  dedupeLudoMovesForUi,
  parseLudoVariant,
  resolveLudoMovesForTurn,
  resolveRemainingDice,
} from '@fateround/shared/ludo'
import { moveDestinationCell } from '@fateround/shared/ludo-board-layout'
import { LudoBoard } from '@/components/games/ludo/LudoBoard'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { postLudoMove, postLudoRoll } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { LUDO_PLAYER_STATE_SELECT, LUDO_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { winnerLeaderboard } from '@/lib/finish-leaderboards'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function LudoPlayerView({ gameCode }: { gameCode: string }) {
  const [session, setSession] = useState<LudoSession | null>(null)
  const [states, setStates] = useState<LudoPlayerState[]>([])
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    const [sessionRes, statesRes] = await Promise.all([
      getSupabase().from('ludo_sessions').select(LUDO_SESSION_SELECT).eq('game_id', gameCode.toUpperCase()).maybeSingle(),
      getSupabase()
        .from('ludo_player_state')
        .select(LUDO_PLAYER_STATE_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .order('player_order'),
    ])
    if (sessionRes.error || statesRes.error) return { state: null, ok: false }
    setSession(sessionRes.data as LudoSession | null)
    setStates((statesRes.data as LudoPlayerState[]) ?? [])
    return { state: null, ok: true }
  }, [gameCode])

  const bootstrap = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen: (game, playerId) => {
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'active') return 'playing'
      return 'finished'
    },
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'ludo_sessions', 'ludo_player_state'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'playing',
  })

  const myState = states.find((s) => s.player_id === bootstrap.myPlayerId)
  const variant = parseLudoVariant(bootstrap.game?.ludo_variant)
  const remainingDice = session ? resolveRemainingDice(session) : []

  const legalMoves = useMemo(() => {
    if (!session || !myState || !isMyTurn || session.phase !== 'move') return []
    return dedupeLudoMovesForUi(
      resolveLudoMovesForTurn(myState.color, myState.pieces, remainingDice, states, myState.player_id, variant)
    )
  }, [session, myState, isMyTurn, remainingDice, states, variant])

  const highlightCells = useMemo(() => {
    if (!myState || legalMoves.length === 0) return undefined
    const cells = new Set<string>()
    for (const move of legalMoves) {
      const dest = moveDestinationCell(myState.color, move.to)
      if (dest) cells.add(`${Math.round(dest.row)},${Math.round(dest.col)}`)
    }
    return cells
  }, [legalMoves, myState])

  const roll = async () => {
    if (!bootstrap.myResumeToken || acting || !isMyTurn) return
    setActing(true)
    try {
      await postLudoRoll(bootstrap.code, bootstrap.myResumeToken)
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  const movePiece = async (pieceId: number, diceIndex: number) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await postLudoMove(bootstrap.code, bootstrap.myResumeToken, pieceId, diceIndex)
      await bootstrap.load()
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
    return (
      <LobbyView {...lobbyProps!} onLeft={onLeft} />
    )
  }
  if (!bootstrap.game || !session) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === session.winner_player_id)
    return (
      <GameShell bootstrap={bootstrap} title={batch3GameLabel('ludo')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title="Game over"
          subtitle="Final standings"
          detail={winner ? `${winner.name} wins!` : undefined}
          leaderboard={winnerLeaderboard(session.winner_player_id, bootstrap.players, bootstrap.myPlayerId)}
        />
      </GameShell>
    )
  }

  const turnName = bootstrap.players.find((p) => p.id === turnPlayerId)?.name ?? 'Someone'

  return (
    <GameShell
      title={batch3GameLabel('ludo')}
      subtitle={isMyTurn ? 'Your turn' : `${turnName}'s turn`}
      gameCode={bootstrap.code}
      game={bootstrap.game}
      players={bootstrap.players}
      myPlayerId={bootstrap.myPlayerId}
      onPromoted={() => bootstrap.load()}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {session.status_message ? <Text style={styles.status}>{session.status_message}</Text> : null}

        {remainingDice.length > 0 ? (
          <Text style={styles.dice}>Dice to play: {remainingDice.join(', ')}</Text>
        ) : null}

        <LudoBoard
          states={states}
          players={bootstrap.players}
          legalMoves={legalMoves}
          myPlayerId={bootstrap.myPlayerId}
          isMyTurn={isMyTurn && session.phase === 'move'}
          highlightCells={highlightCells}
          onMovePiece={(pieceId, diceIndex) => void movePiece(pieceId, diceIndex)}
          acting={acting}
        />

        {isMyTurn && session.phase === 'roll' ? (
          <Pressable style={[styles.btn, acting && styles.btnDisabled]} disabled={acting} onPress={() => void roll()}>
            <Text style={styles.btnText}>{acting ? 'Rolling…' : 'Roll dice'}</Text>
          </Pressable>
        ) : null}

        {!isMyTurn ? <Text style={styles.hint}>Waiting for {turnName}…</Text> : null}
      </ScrollView>
    </GameShell>
  )
}

const styles = StyleSheet.create({
  scroll: { gap: 12, paddingBottom: 24 },
  status: { color: '#9ca3af', textAlign: 'center' },
  dice: { color: '#fcd34d', textAlign: 'center', fontWeight: '700' },
  btn: { backgroundColor: '#f43f5e', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  hint: { color: '#9ca3af', textAlign: 'center' },
})
