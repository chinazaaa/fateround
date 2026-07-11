import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  type SnakeLadderPlayerState,
  type SnakeLadderSession,
} from '@fateround/shared'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import { buildSnakeLadderStandings, currentPlayerId } from '@fateround/shared/snake-and-ladder'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postSnakeLadderRoll } from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { SNAKE_LADDER_PLAYER_STATE_SELECT, SNAKE_LADDER_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { winnerLeaderboard } from '@/lib/finish-leaderboards'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

const COLOR_HEX: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  orange: '#f97316',
}

export function SnakeLadderPlayerView({ gameCode }: { gameCode: string }) {
  const [session, setSession] = useState<SnakeLadderSession | null>(null)
  const [states, setStates] = useState<SnakeLadderPlayerState[]>([])
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    const [sessionRes, statesRes] = await Promise.all([
      getSupabase()
        .from('snake_ladder_sessions')
        .select(SNAKE_LADDER_SESSION_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .maybeSingle(),
      getSupabase()
        .from('snake_ladder_player_state')
        .select(SNAKE_LADDER_PLAYER_STATE_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .order('player_order'),
    ])
    if (sessionRes.error || statesRes.error) return { state: null, ok: false }
    setSession(sessionRes.data as SnakeLadderSession | null)
    setStates((statesRes.data as SnakeLadderPlayerState[]) ?? [])
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
    [{ table: 'games', column: 'id' }, 'snake_ladder_sessions', 'snake_ladder_player_state'],
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

  const standings = session ? buildSnakeLadderStandings(states, bootstrap.players, session.winner_player_id) : []

  const roll = async () => {
    if (!bootstrap.myResumeToken || acting || !isMyTurn) return
    setActing(true)
    try {
      playSound('dice')
      await postSnakeLadderRoll(bootstrap.code, bootstrap.myResumeToken)
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
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game || !session) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === session.winner_player_id)
    return (
      <GameShell bootstrap={bootstrap} title={batch3GameLabel('snake_and_ladder')} subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title="Game over" subtitle="Final standings" detail={winner ? `${winner.name} wins!` : undefined} leaderboard={winnerLeaderboard(session.winner_player_id, bootstrap.players, bootstrap.myPlayerId)} />
      </GameShell>
    )
  }

  return (
    <GameShell bootstrap={bootstrap} title={batch3GameLabel('snake_and_ladder')} subtitle={session.status_message ?? bootstrap.code}>
      <View style={styles.list}>
        {standings.map((row) => (
          <View key={row.playerId} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: COLOR_HEX[row.color] ?? '#64748b' }]} />
            <Text style={styles.name}>{row.name}</Text>
            <Text style={styles.pos}>{row.position === 0 ? 'Start' : row.position >= 100 ? 'Home!' : `Sq ${row.position}`}</Text>
          </View>
        ))}
      </View>

      {session.last_roll ? (
        <Text style={styles.rollInfo}>
          Last roll: {session.last_roll}
          {session.last_from != null && session.last_to != null ? ` (${session.last_from} → ${session.last_to})` : ''}
        </Text>
      ) : null}

      <Pressable style={[styles.btn, (!isMyTurn || acting) && styles.btnDisabled]} disabled={!isMyTurn || acting} onPress={() => void roll()}>
        <Text style={styles.btnText}>{isMyTurn ? (acting ? 'Rolling…' : 'Roll dice') : 'Waiting for turn…'}</Text>
      </Pressable>
    </GameShell>
  )
}

const styles = StyleSheet.create({
  list: { gap: 8, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#17171d', borderRadius: 12 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  name: { color: '#fff', flex: 1, fontWeight: '600' },
  pos: { color: '#fcd34d', fontWeight: '700' },
  rollInfo: { color: '#9ca3af', textAlign: 'center', marginVertical: 12 },
  btn: { backgroundColor: '#f43f5e', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
})
