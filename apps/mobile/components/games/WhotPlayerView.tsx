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
import { playerIsViewer } from '@fateround/shared/viewers'
import { CardTableArea } from '@/components/games/cards/CardTableArea'
import { GameTimerBar } from '@/components/games/cards/GameTimerBar'
import { CrazyEightsRoster } from '@/components/games/cards/CrazyEightsRoster'
import { WhotCardFace } from '@/components/games/cards/WhotCardFace'
import { WhotShapeIcon } from '@/components/games/cards/WhotShapeIcon'
import { useTurnDeadlineSeconds } from '@/components/games/cards/useTurnDeadlineSeconds'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
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
  const styles = useThemedStyles(makeStyles)
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

  // Watch-only surface (mirrors web isWatching = isViewer || isOut):
  //  · isViewer — joined mid-game / eliminated / flagged spectator (read-only).
  //  · isOut — our dealt hand row is loaded and now empty (we played our last card
  //    and went out). Guard on the row actually being loaded so a not-yet-fetched
  //    hand isn't briefly treated as empty and flip a still-playing player to watch.
  const me = bootstrap.myPlayerId
    ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) ?? null
    : null
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))
  const isOut = !!myHand && myHand.cards.length === 0 && bootstrap.game?.status === 'active'
  const isWatching = isViewer || isOut

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
    // Mid-game: the only way in is as a read-only viewer (whot never seats late
    // joiners as players — spectatorForActiveJoin forces spectator). Present the
    // join form as a viewer flow so the intent is clear before submitting.
    const joiningAsViewer = bootstrap.game.status === 'active'
    return (
      <JoinScreen
        gameCode={bootstrap.code}
        joinName={bootstrap.joinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onChangeName={bootstrap.setJoinName}
        onJoin={() => void bootstrap.join(undefined, joiningAsViewer ? { joinAsViewer: true } : undefined)}
        kicker={joiningAsViewer ? 'Watch game' : 'Join game'}
        hint={
          joiningAsViewer
            ? 'Game in progress — enter a name to watch as a viewer (read-only).'
            : 'No account needed — enter a display name and play.'
        }
        submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
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
  // Persistent "Must play …" demand for an active WHOT call. Covers both a called
  // shape AND a called number (number calls enabled) — mirrors the web demand badge,
  // which stays visible for the whole call even after status_message is overwritten.
  const demandLabel = hasActiveWhotCall(session)
    ? session.required_shape
      ? `Must play ${WHOT_SHAPE_LABELS[session.required_shape]}`
      : session.required_number != null
        ? `Must play number ${session.required_number}`
        : null
    : null
  const tableHint = [demandLabel, penaltyLabel].filter(Boolean).join(' · ')
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

  // Order the roster by turn_order so seats read in play order (matching web); append
  // any players not seated in the turn order (e.g. pure spectators) at the end.
  const orderedPlayers = (() => {
    const byId = new Map(bootstrap.players.map((p) => [p.id, p]))
    const seated = (session.turn_order ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is Player => !!p)
    const seatedIds = new Set(seated.map((p) => p.id))
    const rest = bootstrap.players.filter((p) => !seatedIds.has(p.id))
    return [...seated, ...rest]
  })()

  // When the draw pile is empty it reshuffles from the played (discard) cards — surface
  // that so an empty pile doesn't read as "no cards left to draw".
  const drawReshuffles = drawDepleted && session.discard_pile.length > 0

  return (
    <GameShell bootstrap={bootstrap} title={batch4GameLabel('whot')} subtitle={bootstrap.code}>
      {gameDurationSeconds > 0 && gameSecondsLeft > 0 ? (
        <GameTimerBar secondsLeft={gameSecondsLeft} durationSeconds={gameDurationSeconds} />
      ) : null}
      <TurnBanner
        text={isWatching ? `Spectating — ${turnName}'s turn` : session.status_message ?? `${turnName}'s turn`}
        isMyTurn={isMyTurn && !isWatching}
      />
      {timerSeconds > 0 ? <TimerBadge seconds={timerSeconds} /> : null}

      {isWatching ? (
        <View style={styles.watchBanner}>
          <Text style={styles.watchTitle}>{isOut ? "You're out" : 'Watching'}</Text>
          <Text style={styles.watchSub}>
            {isOut
              ? 'You played all your cards — follow the rest of the game and chat.'
              : 'Read-only spectator — you can follow the game and chat.'}
          </Text>
        </View>
      ) : null}

      {isWatching ? (
        <View style={styles.rosterHead}>
          <Text style={styles.rosterTitle}>Players · {bootstrap.players.length}</Text>
          <Text style={styles.rosterTag}>watch-only</Text>
        </View>
      ) : null}

      <CrazyEightsRoster
        players={orderedPlayers}
        turnPlayerId={turnPlayerId}
        myPlayerId={bootstrap.myPlayerId}
        handCounts={handCounts}
        finishOrder={session.finish_order ?? []}
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

      {drawReshuffles ? (
        <Text style={styles.reshuffleNote}>Draw pile empty — reshuffles from played cards</Text>
      ) : null}

      {isWatching ? (
        <Text style={styles.spectateStatus}>
          Spectating — {turnName}&apos;s turn · you can chat
        </Text>
      ) : null}

      {!isWatching && choosingWhot && isMyTurn ? (
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

      {!isWatching ? (
        <>
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
        </>
      ) : null}
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  emptyTop: { color: theme.text, fontSize: 24, fontWeight: '800' },
  section: { color: theme.text, fontSize: 16, fontWeight: '600', marginTop: 4 },
  watchBanner: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
  },
  watchTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
  watchSub: { color: theme.textMuted, fontSize: 12, textAlign: 'center' },
  rosterHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  rosterTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
  rosterTag: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },
  spectateStatus: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 2 },
  reshuffleNote: { color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: -2 },
  choosePanel: { gap: 8 },
  shapeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shapeHint: { color: theme.textMuted, fontSize: 12 },
  numberRow: { gap: 6, paddingVertical: 4 },
  callBtn: {
    backgroundColor: theme.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 4,
  },
  callText: { color: theme.text, fontSize: 11, fontWeight: '600' },
  hand: { gap: 8, paddingVertical: 8 },
  drawBtn: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  drawText: { color: theme.text, fontSize: 16, fontWeight: '600' },
})
