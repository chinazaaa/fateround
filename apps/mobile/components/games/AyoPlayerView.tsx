import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { legalMovesForSide, sideForPlayer, currentTurnPlayerId } from '@fateround/shared/ayo'
import type { AyoSession, Game, Player } from '@fateround/shared'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { AyoBoard } from '@/components/games/ayo/AyoBoard'
import { useAyoSowAnimation } from '@/hooks/useAyoSowAnimation'
import { useAyoClockExpiry } from '@/hooks/useAyoClockExpiry'
import { parseAyoVariant, ayoResultDetail } from '@/lib/ayo-sow'
import { playAyoSeedDrop, playAyoTurnChime } from '@/lib/ayo-sounds'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { postAyoMove, postAyoResign } from '@/lib/game-api'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { getSupabase } from '@/lib/supabase'
import { AYO_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { ayoLeaderboard } from '@/lib/finish-leaderboards'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Screen = 'loading' | 'join' | 'waiting' | 'active' | 'finished' | 'not_found'

export function AyoPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [session, setSession] = useState<AyoSession | null>(null)
  const [acting, setActing] = useState(false)
  const [resignOpen, setResignOpen] = useState(false)
  const { animation, playSowAnimation } = useAyoSowAnimation({ onSeedDrop: playAyoSeedDrop })

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
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    ['players', { table: 'games', column: 'id' }, 'ayo_sessions'],
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

  useAyoClockExpiry(bootstrap.code, activeSession, bootstrap.screen === 'active')

  // Chime once when it becomes your turn (matches the web turn sound).
  const prevMyTurn = useRef(false)
  useEffect(() => {
    const active = bootstrap.screen === 'active'
    if (active && isMyTurn && !prevMyTurn.current) playAyoTurnChime()
    prevMyTurn.current = active && isMyTurn
  }, [isMyTurn, bootstrap.screen])

  const mySide = bootstrap.myPlayerId && activeSession ? sideForPlayer(activeSession, bootstrap.myPlayerId) : null

  const sow = async (pitIndex: number) => {
    if (!bootstrap.myResumeToken || !isMyTurn || !activeSession) return
    setActing(true)
    const config = {
      variant: parseAyoVariant(bootstrap.game?.ayo_variant),
      aRowSize: activeSession.a_row_size,
      bRowSize: activeSession.b_row_size,
    }
    try {
      // Fire the move and the seed-by-seed animation together; reconcile with
      // the authoritative server state once both settle.
      await Promise.all([
        postAyoMove(bootstrap.code, bootstrap.myResumeToken, pitIndex),
        playSowAnimation(activeSession.pits, pitIndex, config),
      ])
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  const confirmResign = () => {
    const token = bootstrap.myResumeToken
    if (!token) return
    void (async () => {
      setActing(true)
      try {
        await postAyoResign(bootstrap.code, token)
        setResignOpen(false)
        await bootstrap.load()
      } finally {
        setActing(false)
      }
    })()
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
    const variant = parseAyoVariant(bootstrap.game?.ayo_variant)
    const title = activeSession.is_draw ? 'Draw!' : winner ? `${winner.name} · Ọta wins!` : 'Game over'
    const reason = ayoResultDetail(activeSession.result_reason, variant)
    const subtitle = reason ? reason.charAt(0).toUpperCase() + reason.slice(1) : 'Final standings'
    const detail =
      variant === 'traditional' && activeSession.match_round
        ? `Round ${activeSession.match_round}`
        : activeSession.status_message
    return (
      <GameShell bootstrap={bootstrap} title="Ayo" subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={title}
          subtitle={subtitle}
          detail={detail}
          leaderboard={ayoLeaderboard(activeSession, bootstrap.players, variant, bootstrap.myPlayerId)}
          winnerPlayerId={activeSession.winner_player_id}
          roundKey={activeSession.id}
        />
      </GameShell>
    )
  }

  const legal =
    mySide && isMyTurn && !animation.animating
      ? legalMovesForSide(activeSession.pits, mySide, activeSession.a_row_size, activeSession.b_row_size)
      : []
  const turnPlayer = bootstrap.players.find((p) => p.id === turnPlayerId)
  const nameOf = (pid: string) => bootstrap.players.find((p) => p.id === pid)?.name ?? 'Player'

  return (
    <GameShell bootstrap={bootstrap} title="Ayo" subtitle={`Code ${bootstrap.code}`}>
      <TurnBanner
        text={isMyTurn ? 'Your turn — pick a house' : `${turnPlayer?.name ?? 'Opponent'}'s turn`}
        isMyTurn={isMyTurn}
      />
      <AyoBoard
        session={activeSession}
        mySide={mySide}
        legal={legal}
        disabled={acting || !isMyTurn || animation.animating}
        onMove={sow}
        animation={animation}
        variant={parseAyoVariant(bootstrap.game?.ayo_variant)}
        nameA={nameOf(activeSession.player_a_id)}
        nameB={nameOf(activeSession.player_b_id)}
      />
      {mySide && bootstrap.myPlayerId ? (
        <Text style={styles.sideLabel}>You are {nameOf(bootstrap.myPlayerId)}</Text>
      ) : null}
      {mySide ? (
        <Pressable
          style={styles.resignBtn}
          disabled={acting || animation.animating}
          onPress={() => {
            if (bootstrap.myResumeToken) setResignOpen(true)
          }}
        >
          <Text style={styles.resignText}>Resign</Text>
        </Pressable>
      ) : null}
      <ConfirmDialog
        visible={resignOpen}
        title="Resign this game?"
        message="Your opponent will be crowned Ọta."
        confirmLabel="Resign"
        destructive
        confirming={acting}
        onConfirm={confirmResign}
        onCancel={() => setResignOpen(false)}
      />
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    sideLabel: { color: theme.textMuted, textAlign: 'center' },
    resignBtn: {
      alignSelf: 'center',
      marginTop: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: '#3f1515',
    },
    resignText: { color: '#fca5a5', fontWeight: '700' },
  })
