import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type Game, type Player, type WhotPlayerHand, type WhotSession, type WhotShape } from '@fateround/shared'
import { batch4GameLabel } from '@fateround/shared/batch-4-games'
import {
  WHOT_SHAPE_LABELS,
  canPlayCard,
  currentPlayerId,
  getActivePickPenalty,
  hasActiveWhotCall,
  hasPlayableCard,
  isDrawPileDepleted,
  parseWhotRules,
  whotSecondsLeft,
} from '@fateround/shared/whot'
import { CardTableArea } from '@/components/games/cards/CardTableArea'
import { GameTimerBar } from '@/components/games/cards/GameTimerBar'
import { PlayerTurnRail } from '@/components/games/cards/PlayerTurnRail'
import { WhotCardFace } from '@/components/games/cards/WhotCardFace'
import { WhotShapeIcon } from '@/components/games/cards/WhotShapeIcon'
import { useTurnDeadlineSeconds } from '@/components/games/cards/useTurnDeadlineSeconds'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postWhotChooseNumber, postWhotChooseShape, postWhotDraw, postWhotPlay } from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { WHOT_PLAYER_HANDS_SELECT, WHOT_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { cardHandLeaderboard } from '@/lib/finish-leaderboards'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

const WHOT_CALL_SHAPES: WhotShape[] = ['circle', 'triangle', 'cross', 'square', 'star']
const WHOT_CALL_NUMBERS = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14]

export function WhotPlayerView({ gameCode }: { gameCode: string }) {
  const [session, setSession] = useState<WhotSession | null>(null)
  const [hands, setHands] = useState<WhotPlayerHand[]>([])
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: WhotSession | null; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [sessionRes, handsRes] = await Promise.all([
        getSupabase().from('whot_sessions').select(WHOT_SESSION_SELECT).eq('game_id', code).maybeSingle(),
        getSupabase().from('whot_player_hands').select(WHOT_PLAYER_HANDS_SELECT).eq('game_id', code).order('player_order'),
      ])
      if (sessionRes.error || handsRes.error) return { state: null, ok: false }
      const sessionData = sessionRes.data as WhotSession | null
      setSession(sessionData)
      setHands((handsRes.data as WhotPlayerHand[]) ?? [])
      return { state: sessionData, ok: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null): Screen => {
    if (!playerId) return 'join'
    if (game.status === 'waiting') return 'waiting'
    if (game.status === 'finished') return 'finished'
    return 'playing'
  }, [])

  const bootstrap = useGameViewBootstrap<Screen, WhotSession | null>({
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
    [{ table: 'games', column: 'id' }, 'whot_sessions', 'whot_player_hands'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const rules = parseWhotRules(bootstrap.game)
  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId
  const myHand = hands.find((h) => h.player_id === bootstrap.myPlayerId)

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'playing',
  })

  const penalty = session ? getActivePickPenalty(session) : null
  const choosingWhot = session?.phase === 'choose_whot' && isMyTurn

  const playableIds = useMemo(() => {
    if (!session || !myHand) return new Set<string>()
    return new Set(myHand.cards.filter((c) => canPlayCard(c, session, rules)).map((c) => c.id))
  }, [session, myHand, rules])

  const timerSeconds = useTurnDeadlineSeconds(
    whotSecondsLeft,
    session?.turn_deadline_at,
    !!session?.turn_deadline_at && session.phase === 'playing'
  )

  const gameDurationSeconds = bootstrap.game?.game_duration_seconds ?? 0
  const gameDeadlineAt = useMemo(() => {
    const start = bootstrap.game?.session_started_at
    if (!start || gameDurationSeconds <= 0) return null
    return new Date(new Date(start).getTime() + gameDurationSeconds * 1000).toISOString()
  }, [bootstrap.game?.session_started_at, gameDurationSeconds])
  const gameSecondsLeft = useTurnDeadlineSeconds(
    whotSecondsLeft,
    gameDeadlineAt,
    !!gameDeadlineAt && bootstrap.game?.status === 'active'
  )

  const handCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const hand of hands) counts[hand.player_id] = hand.cards.length
    return counts
  }, [hands])

  const act = async (fn: () => Promise<unknown>) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await fn()
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  const playCard = (cardId: string) => {
    playSound('card')
    return act(() => postWhotPlay(bootstrap.code, bootstrap.myResumeToken!, cardId))
  }

  const chooseShape = (shape: WhotShape) =>
    act(() => postWhotChooseShape(bootstrap.code, bootstrap.myResumeToken!, shape))

  const chooseNumber = (number: number) =>
    act(() => postWhotChooseNumber(bootstrap.code, bootstrap.myResumeToken!, number))

  const drawCard = () => {
    playSound('card')
    return act(() => postWhotDraw(bootstrap.code, bootstrap.myResumeToken!))
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
    // Rank everyone who was seated (session.turn_order) — NOT `!spectator`, because
    // the winner is flagged out-of-play when they empty their hand and would be
    // dropped, leaving the crown on a loser. Fall back to seated players if needed.
    const playerById = new Map(bootstrap.players.map((p) => [p.id, p]))
    const seatIds =
      session.turn_order && session.turn_order.length > 0
        ? session.turn_order
        : bootstrap.players.filter((p) => !p.spectator).map((p) => p.id)
    const standings = seatIds
      .map((id) => playerById.get(id))
      .filter((p): p is Player => !!p)
      .map((p) => {
        const cards = hands.find((h) => h.player_id === p.id)?.cards ?? []
        return {
          id: p.id,
          name: p.name,
          points: cards.reduce((sum, c) => sum + (c.number ?? 0), 0),
          cardCount: cards.length,
        }
      })
    return (
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('whot')} subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title={winner ? `${winner.name} wins!` : 'Game over'} subtitle="Final standings" leaderboard={cardHandLeaderboard(standings, session.winner_player_id, bootstrap.myPlayerId)} winnerPlayerId={session.winner_player_id} roundKey={session.id} />
      </GameShell>
    )
  }

  const turnName = bootstrap.players.find((p) => p.id === turnPlayerId)?.name ?? 'Someone'
  const penaltyLabel =
    penalty?.type === 'pick2'
      ? `Pick 2 — play a 2 or draw ${penalty.count}`
      : penalty?.type === 'pick3'
        ? `Pick 3 — play a 5 or draw ${penalty.count}`
        : null
  const tableHint = [
    hasActiveWhotCall(session) && session.required_shape
      ? `Must match ${WHOT_SHAPE_LABELS[session.required_shape]}`
      : null,
    penaltyLabel,
  ]
    .filter(Boolean)
    .join(' · ')
  // Match the web: the draw/pass action is available on your turn unless the pile
  // is depleted AND you already hold a playable card (then you must play it). This
  // means you can still draw voluntarily even when holding a wild WHOT.
  const drawDepleted = isDrawPileDepleted(session)
  const canPlayNow = !!myHand && hasPlayableCard(myHand.cards, session, rules)
  const canDraw =
    isMyTurn && session.phase === 'playing' && !choosingWhot && !(drawDepleted && canPlayNow)
  const drawLabel = drawDepleted
    ? 'Pass turn'
    : penalty?.type === 'pick2'
      ? `Draw ${penalty.count} (Pick 2)`
      : penalty?.type === 'pick3'
        ? `Draw ${penalty.count} (Pick 3)`
        : 'Draw a card'

  return (
    <GameShell bootstrap={bootstrap} title={batch4GameLabel('whot')} subtitle={bootstrap.code}>
      {gameDurationSeconds > 0 && gameSecondsLeft > 0 ? (
        <GameTimerBar secondsLeft={gameSecondsLeft} durationSeconds={gameDurationSeconds} />
      ) : null}
      <TurnBanner text={session.status_message ?? `${turnName}'s turn`} isMyTurn={isMyTurn} />
      {timerSeconds > 0 ? <TimerBadge seconds={timerSeconds} /> : null}

      <PlayerTurnRail
        players={bootstrap.players}
        turnPlayerId={turnPlayerId}
        myPlayerId={bootstrap.myPlayerId}
        handCounts={handCounts}
      />

      <CardTableArea
        pileCount={session.draw_pile.length}
        hint={tableHint || null}
        drawAccent="#059669"
        topCard={
          session.top_card ? (
            <WhotCardFace card={session.top_card} big />
          ) : (
            <Text style={styles.emptyTop}>—</Text>
          )
        }
      />

      {choosingWhot && isMyTurn ? (
        <View style={styles.choosePanel}>
          <Text style={styles.section}>Call the next play</Text>
          <Text style={styles.shapeHint}>Shape</Text>
          <View style={styles.shapeRow}>
            {WHOT_CALL_SHAPES.map((shape) => (
              <Pressable key={shape} style={styles.callBtn} disabled={acting} onPress={() => void chooseShape(shape)}>
                <WhotShapeIcon shape={shape} size={22} />
                <Text style={styles.callText}>{WHOT_SHAPE_LABELS[shape]}</Text>
              </Pressable>
            ))}
          </View>
          {rules.numberCallsEnabled ? (
            <>
              <Text style={styles.shapeHint}>Number</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.numberRow}>
                {WHOT_CALL_NUMBERS.map((n) => (
                  <Pressable key={n} style={styles.callBtn} disabled={acting} onPress={() => void chooseNumber(n)}>
                    <Text style={styles.callText}>{n}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.section}>Your hand ({myHand?.cards.length ?? 0})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hand}>
        {(myHand?.cards ?? []).map((card) => {
          const playable = playableIds.has(card.id)
          return (
            <Pressable
              key={card.id}
              disabled={acting || !isMyTurn || !playable || session.phase !== 'playing'}
              onPress={() => void playCard(card.id)}
            >
              <WhotCardFace card={card} playable={playable && isMyTurn} />
            </Pressable>
          )
        })}
      </ScrollView>

      {canDraw ? (
        <Pressable style={styles.drawBtn} disabled={acting} onPress={() => void drawCard()}>
          <Text style={styles.drawText}>{drawLabel}</Text>
        </Pressable>
      ) : null}
    </GameShell>
  )
}

const styles = StyleSheet.create({
  emptyTop: { color: '#fff', fontSize: 24, fontWeight: '800' },
  section: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 4 },
  choosePanel: { gap: 8 },
  shapeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shapeHint: { color: '#9ca3af', fontSize: 12 },
  numberRow: { gap: 6, paddingVertical: 4 },
  callBtn: {
    backgroundColor: '#3f1d2b',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 4,
  },
  callText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  hand: { gap: 8, paddingVertical: 8 },
  drawBtn: {
    backgroundColor: '#17171d',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a35',
  },
  drawText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
