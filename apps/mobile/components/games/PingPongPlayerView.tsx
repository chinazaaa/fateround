import { useCallback } from 'react'
import { ScrollView, StyleSheet, Text } from 'react-native'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import type { Game, GameType, Player, PingPongSession } from '@fateround/shared'
import { pingPongGameSessionExpired } from '@fateround/shared/ping-pong'
import { PingPongBoardView } from '@/components/games/ping-pong/PingPongBoardView'
import { JoinScreen } from '@/components/JoinScreen'
import { GameInfoChips } from '@/components/GameInfoChips'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { getSupabase } from '@/lib/supabase'
import { PING_PONG_SESSION_SELECT } from '@/lib/supabase-selects'
import { postPingPongExpire } from '@/lib/game-api'
import { usePlayerSessionActions } from '@/lib/player-session'
import { winnerLeaderboard } from '@/lib/finish-leaderboards'
import { gameLabel } from '@/lib/mobile-registry'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

export function PingPongPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: PingPongSession | null; ok: boolean }> => {
      const res = await getSupabase()
        .from('ping_pong_sessions')
        .select(PING_PONG_SESSION_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .maybeSingle()
      const data = (res.data as PingPongSession | null) ?? null
      return { state: data, ok: !res.error }
    },
    [gameCode]
  )

  const computeScreen = useCallback(
    (game: Game, playerId: string | null, sessionData: PingPongSession | null): Screen => {
      if (!playerId) {
        const pre = preJoinScreen(game, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        return 'join'
      }
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'active' && sessionData?.status !== 'finished') return 'active'
      if (game.status === 'finished' || sessionData?.status === 'finished') return 'finished'
      return 'waiting'
    },
    []
  )

  const bootstrap = useGameViewBootstrap<Screen, PingPongSession | null>({
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
    ['players', { table: 'games', column: 'id' }, 'ping_pong_sessions'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const session = bootstrap.gameState
  const gameType = (bootstrap.game?.game_type ?? 'ping_pong') as GameType
  const label = gameLabel(gameType)

  const me = bootstrap.myPlayerId ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) : undefined
  const isViewer = !!(bootstrap.game && me && playerIsViewer(me, bootstrap.game))

  // Timed matches: whoever's watching pokes the expiry route once the clock runs out —
  // the server is idempotent so multiple clients firing this is harmless.
  const maybeExpire = useCallback(() => {
    if (!bootstrap.game) return
    const durationSeconds = bootstrap.game.game_duration_seconds ?? 0
    if (
      bootstrap.game.status === 'active' &&
      pingPongGameSessionExpired(bootstrap.game.session_started_at ?? null, durationSeconds)
    ) {
      void postPingPongExpire(bootstrap.code)
        .catch(() => undefined)
        .finally(() => void bootstrap.load())
    }
  }, [bootstrap])

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />
  if (bootstrap.screen === 'game_ended') return <GameEndedScreen game={bootstrap.game} />
  if (bootstrap.screen === 'game_started_waiting' && bootstrap.game) {
    return (
      <GameStartedWaitingScreen gameCode={bootstrap.code} game={bootstrap.game} onLobbyOpen={() => void bootstrap.load()} />
    )
  }
  if (bootstrap.screen === 'join' && bootstrap.game) {
    const joiningAsViewer = bootstrap.game.status === 'active'
    return (
      <JoinScreen
        gameCode={bootstrap.code}
        joinName={bootstrap.joinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onChangeName={bootstrap.setJoinName}
        onJoin={() => void bootstrap.join(undefined, joiningAsViewer ? { joinAsViewer: true } : undefined)}
        lobbyFull={bootstrap.lobbyFull}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
        kicker={joiningAsViewer ? 'Watch game' : 'Join game'}
        hint={
          joiningAsViewer
            ? 'Game in progress — enter a name to watch as a viewer (read-only).'
            : 'No account needed — enter a display name and play.'
        }
        submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
        infoChips={<GameInfoChips game={bootstrap.game} />}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game || !session) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === session.winner_player_id)
    const title = winner ? `${winner.name} wins!` : 'Game over'
    return (
      <GameShell bootstrap={bootstrap} title={label} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={title}
          subtitle="Final standings"
          detail={session.status_message ?? undefined}
          leaderboard={winnerLeaderboard(session.winner_player_id, bootstrap.players, bootstrap.myPlayerId)}
          winnerPlayerId={session.winner_player_id}
          roundKey={session.id}
          hideDefaultHeader
        />
      </GameShell>
    )
  }

  maybeExpire()

  return (
    <GameShell bootstrap={bootstrap} title={label} subtitle={`Code ${bootstrap.code}`}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.status}>{session.status_message}</Text>
        <PingPongBoardView
          gameCode={bootstrap.code}
          session={session}
          players={bootstrap.players}
          myPlayerId={bootstrap.myPlayerId}
          myResumeToken={bootstrap.myResumeToken}
          isViewer={isViewer}
          onPointScored={() => void bootstrap.load()}
        />
      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { paddingBottom: 32, gap: 12, alignItems: 'center' },
    status: { color: theme.textMuted, fontSize: 12, textAlign: 'center' },
  })
