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
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import { CardTableArea } from '@/components/games/cards/CardTableArea'
import { GameTimerBar } from '@/components/games/cards/GameTimerBar'
import { useGameExpiryTimer } from '@/hooks/useGameExpiryTimer'
import { useStickyTimer } from '@/components/session/StickyTimerContext'
import { useTurnExpiryTimer } from '@/hooks/useTurnExpiryTimer'
import { CrazyEightsRoster } from '@/components/games/cards/CrazyEightsRoster'
import { WhotCardFace } from '@/components/games/cards/WhotCardFace'
import { CardHand } from '@/components/games/cards/CardHand'
import { WhotShapeIcon } from '@/components/games/cards/WhotShapeIcon'
import { useTurnDeadlineSeconds } from '@/components/games/cards/useTurnDeadlineSeconds'
// Per-seat turn countdown chip (names the active seat) — replaces the bare TimerBadge.
import { WhotTurnTimerChip } from '@/components/games/WhotTurnTimerChip'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { useGamePlacements, useGameStats } from '@/components/session/RosterDrawerContext'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import {
  postWhotChooseNumber,
  postWhotChooseShape,
  postWhotDraw,
  postWhotExpireTurn,
  postWhotPlay,
} from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { WHOT_PLAYER_HANDS_SELECT, WHOT_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { cardHandLeaderboard } from '@/lib/finish-leaderboards'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'playing'
  | 'finished'
  | 'not_found'

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
        getSupabase()
          .from('whot_player_hands')
          .select(WHOT_PLAYER_HANDS_SELECT)
          .eq('game_id', code)
          .order('player_order'),
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
    if (!playerId) {
      // No session yet: offer the platform pre-join gates. Whot never seats late
      // joiners as players, so there's no watch-or-play choice — either the lobby
      // is open (join), the host started with viewers disabled ("game in progress —
      // waiting for lobby"), or the game already ended ("this game has ended").
      const pre = preJoinScreen(game, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
    }
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
  const me = bootstrap.myPlayerId ? (bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) ?? null) : null
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))
  const isOut = !!myHand && myHand.cards.length === 0 && bootstrap.game?.status === 'active'
  const isWatching = isViewer || isOut

  // Desync guard: the hands table loaded (other players' rows are present) but
  // NONE of them is ours. That means our session player id doesn't match the id
  // the game dealt a hand to — typically after a rejoin that minted a new player
  // id with no dealt hand. Without this we'd fall through to the normal hand
  // section and render a misleading "Your hand (0)" as if we'd emptied our hand
  // (and won). Show a recovery state instead, and never treat this as isOut.
  const handMissing =
    !isWatching && !myHand && hands.length > 0 && bootstrap.game?.status === 'active' && bootstrap.screen === 'playing'

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

  // End the game when the whole-game duration runs out (the timer bar otherwise
  // just drains to 0:00 with nothing telling the server to finish). Matches web.
  useGameExpiryTimer({
    endpoint: `/api/games/${gameCode}/expire-whot`,
    game: bootstrap.game,
    onExpired: () => void bootstrap.load(),
  })

  // Advance a stalled turn when its per-turn timer runs out. Any active client
  // fires it (idempotent + deadline-gated server-side) — matches web.
  useTurnExpiryTimer({
    deadlineAt: session?.turn_deadline_at,
    enabled: bootstrap.game?.status === 'active' && session?.phase === 'playing',
    onExpire: () => postWhotExpireTurn(bootstrap.code).then(() => bootstrap.load()),
  })

  const handCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const hand of hands) counts[hand.player_id] = hand.cards.length
    return counts
  }, [hands])

  // Feed winner/runner-up medal pills into the roster drawer. finish_order lists
  // players in the order they emptied their hands (first out = winner); ensure the
  // declared winner is 1st even if they aren't in finish_order yet.
  const placements = useMemo(() => {
    const map: Record<string, number> = {}
    ;(session?.finish_order ?? []).forEach((id, i) => {
      map[id] = i + 1
    })
    const winnerId = session?.winner_player_id
    if (winnerId && !(winnerId in map)) map[winnerId] = 1
    return Object.keys(map).length ? map : null
  }, [session?.finish_order, session?.winner_player_id])
  useGamePlacements(placements)

  // Live card counts in the roster drawer scoreboard (only while playing).
  const rosterDetails = useMemo(() => {
    if (bootstrap.game?.status !== 'active') return null
    const out: Record<string, string> = {}
    for (const [id, n] of Object.entries(handCounts)) out[id] = `🃏 ${n} card${n === 1 ? '' : 's'}`
    return Object.keys(out).length ? out : null
  }, [handCounts, bootstrap.game?.status])
  useGameStats(rosterDetails)

  // Pin the whole-game countdown below the header so it stays visible as the
  // table scrolls. Falls back to inline rendering under a host shell (no slot).
  const gameTimer =
    gameDurationSeconds > 0 && gameSecondsLeft > 0 ? (
      <GameTimerBar secondsLeft={gameSecondsLeft} durationSeconds={gameDurationSeconds} />
    ) : null
  const gameTimerPinned = useStickyTimer(gameTimer, [gameSecondsLeft, gameDurationSeconds])

  const act = async (fn: () => Promise<unknown>) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await fn()
    } finally {
      // Unblock input as soon as the action lands — don't hold the hand frozen
      // through a second round-trip. The refresh runs in the background (and the
      // realtime subscription reloads on the server write anyway; load() de-dupes).
      setActing(false)
      void bootstrap.load()
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
  if (bootstrap.screen === 'game_ended') return <GameEndedScreen game={bootstrap.game} />
  if (bootstrap.screen === 'game_started_waiting' && bootstrap.game) {
    return (
      <GameStartedWaitingScreen
        gameCode={bootstrap.code}
        game={bootstrap.game}
        onLobbyOpen={() => void bootstrap.load()}
      />
    )
  }
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
        lobbyFull={bootstrap.lobbyFull}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
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
        <GameFinishPanel
          bootstrap={bootstrap}
          title={winner ? `${winner.name} wins!` : 'Game over'}
          subtitle={standings.length > 1 ? 'Lowest hand total wins · WHOT = 20' : 'Final standings'}
          leaderboard={cardHandLeaderboard(standings, session.winner_player_id, bootstrap.myPlayerId)}
          winnerPlayerId={session.winner_player_id}
          roundKey={session.id}
        />
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
  const canDraw = isMyTurn && session.phase === 'playing' && !choosingWhot && !(drawDepleted && canPlayNow)
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
    const seated = (session.turn_order ?? []).map((id) => byId.get(id)).filter((p): p is Player => !!p)
    const seatedIds = new Set(seated.map((p) => p.id))
    const rest = bootstrap.players.filter((p) => !seatedIds.has(p.id))
    return [...seated, ...rest]
  })()

  // When the draw pile is empty it reshuffles from the played (discard) cards — surface
  // that so an empty pile doesn't read as "no cards left to draw".
  const drawReshuffles = drawDepleted && session.discard_pile.length > 0

  return (
    <GameShell bootstrap={bootstrap} title={batch4GameLabel('whot')} subtitle={bootstrap.code}>
      <ScrollView contentContainerStyle={styles.content}>
        {gameTimerPinned ? null : gameTimer}
        <TurnBanner
          text={isWatching ? `Spectating — ${turnName}'s turn` : (session.status_message ?? `${turnName}'s turn`)}
          isMyTurn={isMyTurn && !isWatching}
        />
        {timerSeconds > 0 ? <WhotTurnTimerChip turnName={turnName} seconds={timerSeconds} /> : null}

        {/* Pure spectators get the central ViewerModeBanner (top of the shell) +
            the TurnBanner's "Spectating" text — so their screen matches a player's
            minus the hand. This bespoke banner only covers the distinct "You're
            out" state (finished your hand while the game continues). */}
        {isOut ? (
          <View style={styles.watchBanner}>
            <Text style={styles.watchTitle}>You&apos;re out</Text>
            <Text style={styles.watchSub}>You played all your cards — follow the rest of the game and chat.</Text>
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
            session.top_card ? <WhotCardFace card={session.top_card} big /> : <Text style={styles.emptyTop}>—</Text>
          }
        />

        {drawReshuffles ? (
          <Text style={styles.reshuffleNote}>Draw pile empty — reshuffles from played cards</Text>
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

        {isWatching ? null : handMissing ? (
          <View style={styles.handSyncCard}>
            <Text style={styles.handSyncTitle}>Syncing your hand…</Text>
            <Text style={styles.handSyncSub}>
              Your cards didn&apos;t come through. This can happen after reconnecting — tap refresh.
            </Text>
            <Pressable style={styles.drawBtn} disabled={acting} onPress={() => void bootstrap.load()}>
              <Text style={styles.drawText}>Refresh</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CardHand count={myHand?.cards.length ?? 0} many={(myHand?.cards.length ?? 0) >= 8}>
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
            </CardHand>

            {canDraw ? (
              <Pressable style={styles.drawBtn} disabled={acting} onPress={() => void drawCard()}>
                <Text style={styles.drawText}>{drawLabel}</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { paddingBottom: 32, gap: 12 },
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
    drawBtn: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      padding: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    drawText: { color: theme.text, fontSize: 16, fontWeight: '600' },
    handSyncCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      gap: 10,
      alignItems: 'center',
    },
    handSyncTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
    handSyncSub: { color: theme.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  })
