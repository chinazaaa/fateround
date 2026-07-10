import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type LudoPlayerState, type LudoSession } from '@fateround/shared'
import { batch3GameLabel, pieceStatusLabel } from '@fateround/shared/batch-3-games'
import {
  currentPlayerId,
  dedupeLudoMovesForUi,
  parseLudoVariant,
  resolveLudoMovesForTurn,
  resolveRemainingDice,
} from '@fateround/shared/ludo'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { FinishedPanel, GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postLudoMove, postLudoRoll } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { LUDO_PLAYER_STATE_SELECT, LUDO_SESSION_SELECT } from '@/lib/supabase-selects'

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

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'ludo_sessions', 'ludo_player_state'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId
  const myState = states.find((s) => s.player_id === bootstrap.myPlayerId)
  const variant = parseLudoVariant(bootstrap.game?.ludo_variant)
  const remainingDice = session ? resolveRemainingDice(session) : []

  const legalMoves = useMemo(() => {
    if (!session || !myState || !isMyTurn || session.phase !== 'move') return []
    return dedupeLudoMovesForUi(
      resolveLudoMovesForTurn(myState.color, myState.pieces, remainingDice, states, myState.player_id, variant)
    )
  }, [session, myState, isMyTurn, remainingDice, states, variant])

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
  if (bootstrap.screen === 'waiting' && bootstrap.game) {
    return <LobbyView game={bootstrap.game} players={bootstrap.players} myPlayerId={bootstrap.myPlayerId} />
  }
  if (!bootstrap.game || !session) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === session.winner_player_id)
    return (
      <GameShell title={batch3GameLabel('ludo')} subtitle={bootstrap.code}>
        <FinishedPanel title="Game over" detail={winner ? `${winner.name} wins!` : undefined} />
      </GameShell>
    )
  }

  const turnName = bootstrap.players.find((p) => p.id === turnPlayerId)?.name ?? 'Someone'

  return (
    <GameShell title={batch3GameLabel('ludo')} subtitle={isMyTurn ? 'Your turn' : `${turnName}'s turn`}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {session.status_message ? <Text style={styles.status}>{session.status_message}</Text> : null}

        {remainingDice.length > 0 ? (
          <Text style={styles.dice}>Dice to play: {remainingDice.join(', ')}</Text>
        ) : null}

        {myState ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your pieces</Text>
            {myState.pieces.map((piece) => (
              <Text key={piece.id} style={styles.piece}>
                Piece {piece.id + 1}: {pieceStatusLabel(piece)}
              </Text>
            ))}
          </View>
        ) : null}

        {isMyTurn && session.phase === 'roll' ? (
          <Pressable style={[styles.btn, acting && styles.btnDisabled]} disabled={acting} onPress={() => void roll()}>
            <Text style={styles.btnText}>{acting ? 'Rolling…' : 'Roll dice'}</Text>
          </Pressable>
        ) : null}

        {isMyTurn && session.phase === 'move' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Legal moves</Text>
            {legalMoves.length === 0 ? (
              <Text style={styles.hint}>No moves — waiting for server…</Text>
            ) : (
              legalMoves.map((move) => (
                <Pressable
                  key={`${move.pieceId}-${move.diceIndex}-${move.to.zone}-${move.to.pos}`}
                  style={styles.moveBtn}
                  disabled={acting}
                  onPress={() => void movePiece(move.pieceId, move.diceIndex)}
                >
                  <Text style={styles.moveText}>
                    Piece {move.pieceId + 1} · die {move.diceValue} → {pieceStatusLabel(move.to)}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
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
  section: { gap: 8 },
  sectionTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  piece: { color: '#d1d5db' },
  btn: { backgroundColor: '#f43f5e', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  moveBtn: {
    backgroundColor: '#17171d',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2a2a35',
  },
  moveText: { color: '#fff' },
  hint: { color: '#9ca3af', textAlign: 'center' },
})
