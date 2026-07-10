import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ayoScores, legalMovesForSide, sideForPlayer, currentTurnPlayerId } from '@fateround/shared/ayo'
import type { AyoSession, Game, Player } from '@fateround/shared'
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
import { postAyoMove } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { AYO_SESSION_SELECT } from '@/lib/supabase-selects'

type Screen = 'loading' | 'join' | 'waiting' | 'active' | 'finished' | 'not_found'

export function AyoPlayerView({ gameCode }: { gameCode: string }) {
  const [session, setSession] = useState<AyoSession | null>(null)
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: AyoSession | null; ok: boolean }> => {
      const res = await getSupabase()
        .from('ayo_sessions')
        .select(AYO_SESSION_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .maybeSingle()
      const data = (res.data as AyoSession | null) ?? null
      if (data) setSession(data)
      return { state: data, ok: !res.error }
    },
    [gameCode]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null, sessionData: AyoSession | null): Screen => {
    if (!playerId) return 'join'
    if (game.status === 'waiting') return 'waiting'
    if (game.status === 'active' && sessionData?.status !== 'finished') return 'active'
    if (game.status === 'finished' || sessionData?.status === 'finished') return 'finished'
    return 'waiting'
  }, [])

  const bootstrap = useGameViewBootstrap<Screen, AyoSession | null>({
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
    ['players', { table: 'games', column: 'id' }, 'ayo_sessions'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const activeSession = session ?? bootstrap.gameState
  const turnPlayerId = activeSession ? currentTurnPlayerId(activeSession) : null
  const isMyTurn = bootstrap.myPlayerId != null && turnPlayerId === bootstrap.myPlayerId
  const mySide = bootstrap.myPlayerId && activeSession ? sideForPlayer(activeSession, bootstrap.myPlayerId) : null

  const sow = async (pitIndex: number) => {
    if (!bootstrap.myResumeToken || !isMyTurn) return
    setActing(true)
    try {
      await postAyoMove(bootstrap.code, bootstrap.myResumeToken, pitIndex)
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
  if (!bootstrap.game || !activeSession) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === activeSession.winner_player_id)
    const title = activeSession.is_draw ? 'Draw!' : winner ? `${winner.name} wins!` : 'Game over'
    return (
      <GameShell title="Ayo" subtitle={bootstrap.code}>
        <FinishedPanel title={title} detail={activeSession.status_message} />
      </GameShell>
    )
  }

  const scores = ayoScores(activeSession)
  const legal =
    mySide && isMyTurn
      ? legalMovesForSide(activeSession.pits, mySide, activeSession.a_row_size, activeSession.b_row_size)
      : []
  const turnPlayer = bootstrap.players.find((p) => p.id === turnPlayerId)

  return (
    <GameShell title="Ayo" subtitle={`Code ${bootstrap.code}`}>
      <TurnBanner
        text={isMyTurn ? 'Your turn — tap a pit' : `${turnPlayer?.name ?? 'Opponent'}'s turn`}
        isMyTurn={isMyTurn}
      />
      <View style={styles.scoreRow}>
        <Text style={styles.score}>A: {scores.a}</Text>
        <Text style={styles.score}>B: {scores.b}</Text>
      </View>
      <View style={styles.board}>
        <PitRow
          pits={activeSession.pits.slice(6, 12)}
          offset={6}
          legal={legal}
          disabled={acting || !isMyTurn}
          onPress={sow}
        />
        <PitRow
          pits={activeSession.pits.slice(0, 6)}
          offset={0}
          legal={legal}
          disabled={acting || !isMyTurn}
          onPress={sow}
          reverse
        />
      </View>
      {mySide ? <Text style={styles.sideLabel}>You are side {mySide.toUpperCase()}</Text> : null}
    </GameShell>
  )
}

function PitRow({
  pits,
  offset,
  legal,
  disabled,
  onPress,
  reverse,
}: {
  pits: number[]
  offset: number
  legal: number[]
  disabled: boolean
  onPress: (pit: number) => void
  reverse?: boolean
}) {
  const indices = pits.map((_, i) => offset + (reverse ? 5 - i : i))
  return (
    <View style={styles.pitRow}>
      {indices.map((pitIndex, i) => {
        const seeds = pits[reverse ? 5 - i : i] ?? 0
        const playable = legal.includes(pitIndex)
        return (
          <Pressable
            key={pitIndex}
            style={[styles.pit, playable && styles.pitPlayable]}
            disabled={disabled || !playable}
            onPress={() => onPress(pitIndex)}
          >
            <Text style={styles.seedCount}>{seeds}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between' },
  score: { color: '#fff', fontSize: 16, fontWeight: '700' },
  board: { backgroundColor: '#5c3d1e', borderRadius: 16, padding: 12, gap: 16 },
  pitRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  pit: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 52,
    borderRadius: 999,
    backgroundColor: '#3d2812',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2a1a0d',
  },
  pitPlayable: { borderColor: '#f43f5e' },
  seedCount: { color: '#fde68a', fontSize: 18, fontWeight: '800' },
  sideLabel: { color: '#9ca3af', textAlign: 'center' },
})
