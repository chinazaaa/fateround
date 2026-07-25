import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type Game, type Player, type UnoColor, type UnoPlayerHand, type UnoSession } from '@fateround/shared'
import { batch4GameLabel } from '@fateround/shared/batch-4-games'
import {
  UNO_COLORS,
  UNO_COLOR_HEX,
  UNO_COLOR_LABELS,
  activeColor,
  canPlayCard,
  currentPlayerId,
  hasPlayableCard,
  isDrawPileDepleted,
  parseUnoRules,
  unoSecondsLeft,
} from '@fateround/shared/uno'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import { CardTableArea } from '@/components/games/cards/CardTableArea'
import { GameTimerBar } from '@/components/games/cards/GameTimerBar'
import { useGameExpiryTimer } from '@/hooks/useGameExpiryTimer'
import { useStickyTimer } from '@/components/session/StickyTimerContext'
import { useTurnExpiryTimer } from '@/hooks/useTurnExpiryTimer'
import { CrazyEightsRoster } from '@/components/games/cards/CrazyEightsRoster'
import { UnoCardFace } from '@/components/games/cards/UnoCardFace'
import { CardHand } from '@/components/games/cards/CardHand'
import { useTurnDeadlineSeconds } from '@/components/games/cards/useTurnDeadlineSeconds'
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
  postUnoCallUno,
  postUnoChallenge,
  postUnoChooseColor,
  postUnoDraw,
  postUnoExpireTurn,
  postUnoPass,
  postUnoPlay,
  postUnoSwap,
} from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { UNO_PLAYER_HANDS_SELECT, UNO_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { cardHandLeaderboard } from '@/lib/finish-leaderboards'

/**
 * PHASE 1 (core ruleset) — this view drives: classic play, stacking (Draw Two /
 * Wild Draw Four), the Wild Draw Four challenge window, the missed-"UNO" call
 * penalty, and the 0/7 rule (0 = pass every hand; 7 = swap_target picker below).
 * NOT wired here (Phase 2, tracked in packages/shared/src/uno.ts + docs/mobile-web-parity-plan.md):
 * Multi-Play (laying several cards at once), Jump-In (playing out of turn), Team-Up
 * 2v2, and the `team_leave_decision` phase — those never occur for a mobile-created
 * game in Phase 1 (the create/host settings never turn them on), so this view has no
 * UI for them.
 */

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'playing'
  | 'finished'
  | 'not_found'

export function UnoPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [session, setSession] = useState<UnoSession | null>(null)
  const [hands, setHands] = useState<UnoPlayerHand[]>([])
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: UnoSession | null; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [sessionRes, handsRes] = await Promise.all([
        getSupabase().from('uno_sessions').select(UNO_SESSION_SELECT).eq('game_id', code).maybeSingle(),
        getSupabase()
          .from('uno_player_hands')
          .select(UNO_PLAYER_HANDS_SELECT)
          .eq('game_id', code)
          .order('player_order'),
      ])
      if (sessionRes.error || handsRes.error) return { state: null, ok: false }
      const sessionData = sessionRes.data as UnoSession | null
      setSession(sessionData)
      setHands((handsRes.data as UnoPlayerHand[]) ?? [])
      return { state: sessionData, ok: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null): Screen => {
    if (!playerId) {
      // Uno never seats late joiners as players (mirrors Whot): either the lobby is
      // open (join), the host started with viewers disabled, or the game has ended.
      const pre = preJoinScreen(game, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
    }
    if (game.status === 'waiting') return 'waiting'
    if (game.status === 'finished') return 'finished'
    return 'playing'
  }, [])

  const bootstrap = useGameViewBootstrap<Screen, UnoSession | null>({
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
    [{ table: 'games', column: 'id' }, 'uno_sessions', 'uno_player_hands'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const rules = parseUnoRules(bootstrap.game)
  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId
  const myHand = hands.find((h) => h.player_id === bootstrap.myPlayerId)

  const me = bootstrap.myPlayerId ? (bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) ?? null) : null
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))
  const isOut = !!myHand && myHand.cards.length === 0 && bootstrap.game?.status === 'active'
  const isWatching = isViewer || isOut

  // Desync guard (mirrors Whot/Crazy Eights — see docs memory "card-hand-desync"): the
  // hands table loaded (other players' rows are present) but none of them is ours —
  // our session player id doesn't match the id the game dealt a hand to (typically after
  // a rejoin that minted a new player id with no dealt hand). Show a recovery state
  // instead of falling through to a misleading empty "Your hand (0)" (= "you won").
  const handMissing =
    !isWatching && !myHand && hands.length > 0 && bootstrap.game?.status === 'active' && bootstrap.screen === 'playing'

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'playing',
  })

  const choosingColor = session?.phase === 'choose_color' && isMyTurn
  const inChallengeWindow = session?.phase === 'challenge_window' && isMyTurn
  const inSwapTarget = session?.phase === 'swap_target' && isMyTurn
  const owesUnoCall = !!session && session.uno_pending_player === bootstrap.myPlayerId && !session.uno_called

  const playableIds = useMemo(() => {
    if (!session || !myHand) return new Set<string>()
    return new Set(myHand.cards.filter((c) => canPlayCard(c, session)).map((c) => c.id))
  }, [session, myHand])

  const timerSeconds = useTurnDeadlineSeconds(
    unoSecondsLeft,
    session?.turn_deadline_at,
    !!session?.turn_deadline_at && session.phase !== 'finished'
  )

  const gameDurationSeconds = bootstrap.game?.game_duration_seconds ?? 0
  const gameDeadlineAt = useMemo(() => {
    const start = bootstrap.game?.session_started_at
    if (!start || gameDurationSeconds <= 0) return null
    return new Date(new Date(start).getTime() + gameDurationSeconds * 1000).toISOString()
  }, [bootstrap.game?.session_started_at, gameDurationSeconds])
  const gameSecondsLeft = useTurnDeadlineSeconds(
    unoSecondsLeft,
    gameDeadlineAt,
    !!gameDeadlineAt && bootstrap.game?.status === 'active'
  )

  useGameExpiryTimer({
    endpoint: `/api/games/${gameCode}/expire-uno`,
    game: bootstrap.game,
    onExpired: () => void bootstrap.load(),
  })

  useTurnExpiryTimer({
    deadlineAt: session?.turn_deadline_at,
    enabled: bootstrap.game?.status === 'active' && session?.phase !== 'finished',
    onExpire: () => postUnoExpireTurn(bootstrap.code).then(() => bootstrap.load()),
  })

  const handCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const hand of hands) counts[hand.player_id] = hand.cards.length
    return counts
  }, [hands])

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

  const rosterDetails = useMemo(() => {
    if (bootstrap.game?.status !== 'active') return null
    const out: Record<string, string> = {}
    for (const [id, n] of Object.entries(handCounts)) out[id] = `🎴 ${n} card${n === 1 ? '' : 's'}`
    return Object.keys(out).length ? out : null
  }, [handCounts, bootstrap.game?.status])
  useGameStats(rosterDetails)

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
      setActing(false)
      void bootstrap.load()
    }
  }

  const playCard = (cardId: string) => {
    playSound('card')
    return act(() => postUnoPlay(bootstrap.code, bootstrap.myResumeToken!, cardId, owesUnoCall))
  }

  const chooseColor = (color: UnoColor) =>
    act(() => postUnoChooseColor(bootstrap.code, bootstrap.myResumeToken!, color))

  const drawCard = () => {
    playSound('card')
    return act(() => postUnoDraw(bootstrap.code, bootstrap.myResumeToken!))
  }

  const passTurn = () => act(() => postUnoPass(bootstrap.code, bootstrap.myResumeToken!))

  const callUno = () => act(() => postUnoCallUno(bootstrap.code, bootstrap.myResumeToken!))

  const challenge = (doChallenge: boolean) =>
    act(() => postUnoChallenge(bootstrap.code, bootstrap.myResumeToken!, doChallenge))

  const swapWith = (targetId: string) => act(() => postUnoSwap(bootstrap.code, bootstrap.myResumeToken!, targetId))

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
          points: cards.reduce(
            (sum, c) =>
              sum + (c.kind === 'number' ? (c.value ?? 0) : c.kind === 'wild' || c.kind === 'wild_draw4' ? 50 : 20),
            0
          ),
          cardCount: cards.length,
        }
      })
    return (
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('uno')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={winner ? `${winner.name} wins!` : 'Game over'}
          subtitle={standings.length > 1 ? 'Lowest hand total wins' : 'Final standings'}
          leaderboard={cardHandLeaderboard(standings, session.winner_player_id, bootstrap.myPlayerId)}
          winnerPlayerId={session.winner_player_id}
          roundKey={session.id}
        />
      </GameShell>
    )
  }

  const turnName = bootstrap.players.find((p) => p.id === turnPlayerId)?.name ?? 'Someone'
  const demandColor = activeColor(session)
  const demandLabel = demandColor ? `Must play ${UNO_COLOR_LABELS[demandColor]}` : null
  const penaltyLabel =
    (session.draw_penalty ?? 0) > 0
      ? `Draw ${session.draw_penalty}${session.draw_penalty_kind ? ` — stack a ${session.draw_penalty_kind === 'draw2' ? 'Draw Two' : 'Wild Draw Four'} or draw` : ''}`
      : null
  const tableHint = [demandLabel, penaltyLabel].filter(Boolean).join(' · ')

  const drawDepleted = isDrawPileDepleted(session)
  const canPlayNow = !!myHand && hasPlayableCard(myHand.cards, session)
  const canDraw = isMyTurn && session.phase === 'playing' && !session.drawn_card_id && !(drawDepleted && canPlayNow)
  const canPass = isMyTurn && session.phase === 'playing' && !!session.drawn_card_id
  const drawLabel = drawDepleted ? 'Pass turn' : 'Draw a card'

  const orderedPlayers = (() => {
    const byId = new Map(bootstrap.players.map((p) => [p.id, p]))
    const seated = (session.turn_order ?? []).map((id) => byId.get(id)).filter((p): p is Player => !!p)
    const seatedIds = new Set(seated.map((p) => p.id))
    const rest = bootstrap.players.filter((p) => !seatedIds.has(p.id))
    return [...seated, ...rest]
  })()

  const drawReshuffles = drawDepleted && session.discard_pile.length > 0

  const swapTargets = orderedPlayers.filter(
    (p) => p.id !== bootstrap.myPlayerId && (handCounts[p.id] ?? 0) > 0 && (session.turn_order ?? []).includes(p.id)
  )

  return (
    <GameShell bootstrap={bootstrap} title={batch4GameLabel('uno')} subtitle={bootstrap.code}>
      <ScrollView contentContainerStyle={styles.content}>
        {gameTimerPinned ? null : gameTimer}
        <TurnBanner
          text={isWatching ? `Spectating — ${turnName}'s turn` : (session.status_message ?? `${turnName}'s turn`)}
          isMyTurn={isMyTurn && !isWatching}
        />
        {timerSeconds > 0 ? <WhotTurnTimerChip turnName={turnName} seconds={timerSeconds} /> : null}

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
          drawAccent={demandColor ? UNO_COLOR_HEX[demandColor] : '#334155'}
          topCard={
            session.top_card ? <UnoCardFace card={session.top_card} big /> : <Text style={styles.emptyTop}>—</Text>
          }
        />

        {drawReshuffles ? (
          <Text style={styles.reshuffleNote}>Draw pile empty — reshuffles from played cards</Text>
        ) : null}

        {!isWatching && choosingColor ? (
          <View style={styles.choosePanel}>
            <Text style={styles.section}>Choose a colour</Text>
            <View style={styles.colorRow}>
              {UNO_COLORS.map((color) => (
                <Pressable
                  key={color}
                  style={[styles.colorBtn, { backgroundColor: UNO_COLOR_HEX[color] }]}
                  disabled={acting}
                  onPress={() => void chooseColor(color)}
                >
                  <Text style={styles.colorText}>{UNO_COLOR_LABELS[color]}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {!isWatching && inChallengeWindow ? (
          <View style={styles.choosePanel}>
            <Text style={styles.section}>Wild Draw Four played — accept the draw or challenge?</Text>
            <View style={styles.colorRow}>
              <Pressable style={styles.actionBtn} disabled={acting} onPress={() => void challenge(false)}>
                <Text style={styles.actionText}>Draw {session.draw_penalty || 4}</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.challengeBtn]}
                disabled={acting}
                onPress={() => void challenge(true)}
              >
                <Text style={styles.actionText}>Challenge</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {!isWatching && inSwapTarget ? (
          <View style={styles.choosePanel}>
            <Text style={styles.section}>Played a 7 — choose a player to swap hands with</Text>
            <View style={styles.colorRow}>
              {swapTargets.map((p) => (
                <Pressable key={p.id} style={styles.actionBtn} disabled={acting} onPress={() => void swapWith(p.id)}>
                  <Text style={styles.actionText}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {!isWatching && owesUnoCall && session.phase === 'playing' ? (
          <Pressable style={styles.unoCallBtn} disabled={acting} onPress={() => void callUno()}>
            <Text style={styles.unoCallText}>Call UNO!</Text>
          </Pressable>
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
                const disabled =
                  acting ||
                  !isMyTurn ||
                  !playable ||
                  session.phase !== 'playing' ||
                  (!!session.drawn_card_id && card.id !== session.drawn_card_id)
                return (
                  <Pressable key={card.id} disabled={disabled} onPress={() => void playCard(card.id)}>
                    <UnoCardFace card={card} playable={playable && isMyTurn && !disabled} />
                  </Pressable>
                )
              })}
            </CardHand>

            {canDraw ? (
              <Pressable style={styles.drawBtn} disabled={acting} onPress={() => void drawCard()}>
                <Text style={styles.drawText}>{drawLabel}</Text>
              </Pressable>
            ) : null}

            {canPass ? (
              <Pressable style={styles.drawBtn} disabled={acting} onPress={() => void passTurn()}>
                <Text style={styles.drawText}>Keep the card</Text>
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
    colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    colorBtn: {
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: 'center',
    },
    colorText: { color: '#fff', fontSize: 13, fontWeight: '800' },
    actionBtn: {
      backgroundColor: theme.primarySoft,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: 'center',
    },
    challengeBtn: { backgroundColor: '#fee2e2' },
    actionText: { color: theme.text, fontSize: 13, fontWeight: '700' },
    unoCallBtn: {
      backgroundColor: '#dc2626',
      borderRadius: 10,
      padding: 14,
      alignItems: 'center',
    },
    unoCallText: { color: '#fff', fontSize: 16, fontWeight: '800' },
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
