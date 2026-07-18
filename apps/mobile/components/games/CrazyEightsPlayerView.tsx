import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  type CrazyEightsCalledSuit,
  type CrazyEightsPlayerHand,
  type CrazyEightsSession,
  type Game,
  type Player,
} from '@fateround/shared'
import { batch4GameLabel } from '@fateround/shared/batch-4-games'
import {
  CRAZY8_SUIT_LABELS,
  CRAZY8_SUIT_SYMBOLS,
  buildCrazyEightsStandings,
  canPlayCard,
  crazyEightsSecondsLeft,
  currentPlayerId,
  getNormalizedPenalties,
  hasActiveSuitCall,
  hasPlayableCard,
  isDrawPileDepleted,
  parseCrazyEightsRules,
  specialCardShortLabel,
} from '@fateround/shared/crazy-eights'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import { CardTableArea } from '@/components/games/cards/CardTableArea'
import { CrazyEightsRoster } from '@/components/games/cards/CrazyEightsRoster'
import { GameTimerBar } from '@/components/games/cards/GameTimerBar'
import { useGameExpiryTimer } from '@/hooks/useGameExpiryTimer'
import { useTurnExpiryTimer } from '@/hooks/useTurnExpiryTimer'
import { PlayingCardFace } from '@/components/games/cards/PlayingCardFace'
import { CardHand } from '@/components/games/cards/CardHand'
import { useTurnDeadlineSeconds } from '@/components/games/cards/useTurnDeadlineSeconds'
import { useStickyTimer } from '@/components/session/StickyTimerContext'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import {
  GameLoading,
  GameNotFound,
  GameShell,
  TurnBanner,
  type FinishedLeaderboardRow,
} from '@/components/game/GameChrome'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import {
  postCrazyEightsChoose,
  postCrazyEightsDraw,
  postCrazyEightsExpireTurn,
  postCrazyEightsPlay,
} from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { CRAZY8_PLAYER_HANDS_SELECT, CRAZY8_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'playing'
  | 'finished'
  | 'not_found'

const SUITS: CrazyEightsCalledSuit[] = ['spades', 'clubs', 'hearts', 'diamonds']

export function CrazyEightsPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [session, setSession] = useState<CrazyEightsSession | null>(null)
  const [hands, setHands] = useState<CrazyEightsPlayerHand[]>([])
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: CrazyEightsSession | null; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [sessionRes, handsRes] = await Promise.all([
        getSupabase().from('crazy_eights_sessions').select(CRAZY8_SESSION_SELECT).eq('game_id', code).maybeSingle(),
        getSupabase()
          .from('crazy_eights_player_hands')
          .select(CRAZY8_PLAYER_HANDS_SELECT)
          .eq('game_id', code)
          .order('player_order'),
      ])
      if (sessionRes.error || handsRes.error) return { state: null, ok: false }
      const sessionData = sessionRes.data as CrazyEightsSession | null
      setSession(sessionData)
      setHands((handsRes.data as CrazyEightsPlayerHand[]) ?? [])
      return { state: sessionData, ok: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(game, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
    }
    if (game.status === 'waiting') return 'waiting'
    if (game.status === 'finished') return 'finished'
    return 'playing'
  }, [])

  const bootstrap = useGameViewBootstrap<Screen, CrazyEightsSession | null>({
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
    [{ table: 'games', column: 'id' }, 'crazy_eights_sessions', 'crazy_eights_player_hands'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const rules = parseCrazyEightsRules(bootstrap.game)
  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'playing',
  })

  const myHand = hands.find((h) => h.player_id === bootstrap.myPlayerId)
  const penalties = session ? getNormalizedPenalties(session) : { pickTwo: 0, jokerPenalty: 0 }
  const choosingSuit = session?.phase === 'choose_suit' && isMyTurn

  // Watch-only surface (mirrors web isWatching = isViewer || isOut):
  //  · isViewer — joined mid-game / flagged spectator (read-only).
  //  · isOut — our dealt hand row is loaded and now empty (we played our last card and
  //    went out). Guard on the row actually being loaded so a not-yet-fetched hand isn't
  //    briefly treated as empty and flip a still-playing player into the watch-only UI.
  const me = bootstrap.myPlayerId ? (bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) ?? null) : null
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))
  const isOut = !!myHand && myHand.cards.length === 0 && bootstrap.game?.status === 'active'
  const isWatching = isViewer || isOut

  // Desync guard: the hands table loaded (others' rows present) but none is ours,
  // so our session player id doesn't match the id the game dealt a hand to (seen
  // after a rejoin mints a new player id with no dealt hand). Without this the
  // hand section renders a misleading "Your hand (0)" as if we'd gone out. Show a
  // recovery state instead.
  const handMissing =
    !isWatching && !myHand && hands.length > 0 && bootstrap.game?.status === 'active' && bootstrap.screen === 'playing'

  const playableIds = useMemo(() => {
    if (!session || !myHand) return new Set<string>()
    return new Set(myHand.cards.filter((c) => canPlayCard(c, session, rules)).map((c) => c.id))
  }, [session, myHand, rules])

  const timerSeconds = useTurnDeadlineSeconds(
    crazyEightsSecondsLeft,
    session?.turn_deadline_at,
    !!session?.turn_deadline_at && session.phase === 'playing'
  )

  // Whole-game countdown bar (distinct from the per-turn TimerBadge). Derive the
  // deadline from session start + game_duration_seconds, matching WhotPlayerView.
  const gameDurationSeconds = bootstrap.game?.game_duration_seconds ?? 0
  const gameDeadlineAt = useMemo(() => {
    const start = bootstrap.game?.session_started_at
    if (!start || gameDurationSeconds <= 0) return null
    return new Date(new Date(start).getTime() + gameDurationSeconds * 1000).toISOString()
  }, [bootstrap.game?.session_started_at, gameDurationSeconds])
  const gameSecondsLeft = useTurnDeadlineSeconds(
    crazyEightsSecondsLeft,
    gameDeadlineAt,
    !!gameDeadlineAt && bootstrap.game?.status === 'active'
  )

  // End the game when the whole-game duration runs out (the timer bar otherwise
  // just drains to 0:00 with nothing telling the server to finish). Matches web.
  useGameExpiryTimer({
    endpoint: `/api/games/${gameCode}/expire-crazy-eights`,
    game: bootstrap.game,
    onExpired: () => void bootstrap.load(),
  })

  // Advance a stalled turn when its per-turn timer runs out. Any active client
  // fires it (idempotent + deadline-gated server-side) — matches web.
  useTurnExpiryTimer({
    deadlineAt: session?.turn_deadline_at,
    enabled: bootstrap.game?.status === 'active' && session?.phase === 'playing',
    onExpire: () => postCrazyEightsExpireTurn(bootstrap.code).then(() => bootstrap.load()),
  })

  const gameTimer =
    gameDurationSeconds > 0 && gameSecondsLeft > 0 ? (
      <GameTimerBar secondsLeft={gameSecondsLeft} durationSeconds={gameDurationSeconds} />
    ) : null
  const gameTimerPinned = useStickyTimer(gameTimer, [gameSecondsLeft, gameDurationSeconds])

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
    return act(() => postCrazyEightsPlay(bootstrap.code, bootstrap.myResumeToken!, cardId))
  }

  const drawCard = () => {
    playSound('card')
    return act(() => postCrazyEightsDraw(bootstrap.code, bootstrap.myResumeToken!))
  }

  const chooseSuit = (suit: CrazyEightsCalledSuit) =>
    act(() => postCrazyEightsChoose(bootstrap.code, bootstrap.myResumeToken!, suit))

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
    // Mid-game: the only way in is as a read-only viewer (late joiners are seated as
    // spectators). Present the form as a viewer flow so the intent is clear.
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
        footer={<GameRulesLink gameType="crazy_eights" variant="subtle" />}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game || !session) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === session.winner_player_id)
    // Rich standings: rank every seated player by finishing order (players who emptied
    // their hand first, then lowest hand total). 8 & Joker count 50 — lowest wins.
    const standings = buildCrazyEightsStandings(
      hands,
      bootstrap.players,
      session.turn_order,
      session.finish_order ?? []
    )
    const winnerEmptyHand = standings.find((s) => s.playerId === session.winner_player_id)?.cardCount === 0
    const leaderboard: FinishedLeaderboardRow[] = standings.map((s, index) => {
      const isWinner = s.playerId === session.winner_player_id
      return {
        name: s.name,
        score: isWinner ? 'Winner' : s.cardCount === 0 ? '—' : s.handSum,
        scoreSuffix: isWinner || s.cardCount === 0 ? undefined : 'pts',
        detail: s.cardCount === 0 ? 'Out of cards' : `${s.cardCount} card${s.cardCount === 1 ? '' : 's'} left`,
        you: !!bootstrap.myPlayerId && s.playerId === bootstrap.myPlayerId,
        highlight: index === 0,
      }
    })
    return (
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('crazy_eights')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={winner ? `${winner.name} wins!` : 'Game over'}
          subtitle={
            standings.length > 1
              ? winnerEmptyHand
                ? 'First to empty their hand wins'
                : 'Lowest hand total wins · 8 & Joker = 50'
              : 'Final standings'
          }
          leaderboard={leaderboard}
          winnerPlayerId={session.winner_player_id}
          roundKey={session.id}
        />
      </GameShell>
    )
  }

  const turnName = bootstrap.players.find((p) => p.id === turnPlayerId)?.name ?? 'Someone'
  const tableHint = [
    hasActiveSuitCall(session) && session.required_suit
      ? `Must follow ${CRAZY8_SUIT_LABELS[session.required_suit]} ${CRAZY8_SUIT_SYMBOLS[session.required_suit]} — or play an 8 / Joker to name a new suit`
      : null,
    penalties.pickTwo > 0 ? `Pick ${penalties.pickTwo} penalty` : null,
    penalties.jokerPenalty > 0 ? `Joker penalty: draw ${penalties.jokerPenalty}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const drawDepleted = isDrawPileDepleted(session)
  const myCanPlay = myHand ? hasPlayableCard(myHand.cards, session, rules) : false
  const suitCallActive = hasActiveSuitCall(session)
  // Draw pile empty but played cards remain → the pile reshuffles from the discard.
  const reshuffleNote = drawDepleted && (session.discard_pile?.length ?? 0) > 0

  // Web shows the draw/pass button whenever it's your turn, except when the pile is depleted
  // AND you have a playable card (then you must play). Its label reflects pass vs. penalty.
  const canDraw = isMyTurn && session.phase === 'playing' && !choosingSuit && !(drawDepleted && myCanPlay)
  const drawLabel = drawDepleted
    ? 'Pass turn'
    : penalties.pickTwo > 0
      ? `Draw ${penalties.pickTwo} (Pick 2)`
      : penalties.jokerPenalty > 0
        ? `Draw ${penalties.jokerPenalty} (Joker)`
        : `Draw 1 card`

  const turnHint =
    drawDepleted && myCanPlay
      ? 'Draw pile empty — play a highlighted card.'
      : drawDepleted && !myCanPlay
        ? 'Draw pile empty — pass your turn if you cannot play.'
        : penalties.pickTwo > 0
          ? 'Pick 2 active — play a 2 or draw the penalty.'
          : penalties.jokerPenalty > 0
            ? 'Joker — draw the penalty, no defending.'
            : suitCallActive
              ? 'Match the called suit, play an 8 / Joker to name a new one, or draw from the pile.'
              : 'Tap a highlighted card to play, or draw from the pile.'

  const directionReversed = session.direction < 0
  const directionChip = (
    <View style={styles.dirChip}>
      <Text style={styles.dirGlyph}>{directionReversed ? '↺' : '↻'}</Text>
      <Text style={styles.dirText}>{directionReversed ? 'Reversed' : 'Forward'}</Text>
    </View>
  )

  return (
    <GameShell bootstrap={bootstrap} title={batch4GameLabel('crazy_eights')} subtitle={bootstrap.code}>
      <ScrollView contentContainerStyle={styles.content}>
        {gameTimerPinned ? null : gameTimer}
        <TurnBanner
          text={isWatching ? `Spectating — ${turnName}'s turn` : (session.status_message ?? `${turnName}'s turn`)}
          isMyTurn={isMyTurn && !isWatching}
        />
        {timerSeconds > 0 ? <TimerBadge seconds={timerSeconds} /> : null}

        {/* Pure spectators get the central ViewerModeBanner + the TurnBanner's
            "Spectating" text, so their screen matches a player's minus the hand.
            This banner only covers the distinct "You're out" finished state. */}
        {isOut ? (
          <View style={styles.outBanner}>
            <Text style={styles.outTitle}>You&apos;re out</Text>
            <Text style={styles.outSub}>You played all your cards — watch until the game ends.</Text>
          </View>
        ) : null}

        {directionChip}

        <CrazyEightsRoster
          players={bootstrap.players}
          turnPlayerId={turnPlayerId}
          myPlayerId={bootstrap.myPlayerId}
          handCounts={handCounts}
          finishOrder={session.finish_order ?? []}
        />

        <CardTableArea
          pileCount={session.draw_pile.length}
          hint={tableHint || null}
          topCard={
            session.top_card ? (
              <PlayingCardFace card={session.top_card} specialLabel={specialCardShortLabel(session.top_card, rules)} />
            ) : (
              <Text style={styles.emptyTop}>—</Text>
            )
          }
        />
        {reshuffleNote ? (
          <Text style={styles.reshuffleNote}>Draw pile empty — it reshuffles from the played cards.</Text>
        ) : null}

        {choosingSuit ? (
          <View style={styles.choosePanel}>
            <Text style={styles.chooseHeading}>You played a wild card — choose the suit opponents must match</Text>
            <View style={styles.suitRow}>
              {SUITS.map((suit) => {
                const red = suit === 'hearts' || suit === 'diamonds'
                return (
                  <Pressable key={suit} style={styles.suitBtn} disabled={acting} onPress={() => void chooseSuit(suit)}>
                    <Text style={[styles.suitSymbol, red && styles.suitSymbolRed]}>{CRAZY8_SUIT_SYMBOLS[suit]}</Text>
                    <Text style={styles.suitLabel}>{CRAZY8_SUIT_LABELS[suit]}</Text>
                  </Pressable>
                )
              })}
            </View>
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
            {isMyTurn && session.phase === 'playing' ? <Text style={styles.turnHint}>{turnHint}</Text> : null}

            <CardHand count={myHand?.cards.length ?? 0} many={(myHand?.cards.length ?? 0) >= 8}>
              {(myHand?.cards ?? []).map((card) => {
                const playable = playableIds.has(card.id)
                return (
                  <Pressable
                    key={card.id}
                    disabled={acting || !isMyTurn || !playable || session.phase !== 'playing'}
                    onPress={() => void playCard(card.id)}
                  >
                    <PlayingCardFace
                      card={card}
                      playable={playable && isMyTurn}
                      specialLabel={specialCardShortLabel(card, rules)}
                    />
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
    emptyTop: { color: theme.text, fontSize: 28, fontWeight: '800' },
    turnHint: { color: theme.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 8, marginTop: 2 },
    dirChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      gap: 6,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    dirGlyph: { color: theme.primary, fontSize: 16, fontWeight: '800' },
    dirText: { color: theme.primary, fontSize: 13, fontWeight: '700' },
    outBanner: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.primary,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
      gap: 2,
    },
    outTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
    outSub: { color: theme.textMuted, fontSize: 12, textAlign: 'center' },
    reshuffleNote: { color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: -4 },
    choosePanel: {
      alignSelf: 'stretch',
      gap: 10,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 14,
    },
    chooseHeading: { color: theme.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
    suitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    suitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.bgElevated,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    suitSymbol: { color: theme.text, fontSize: 20, fontWeight: '800', lineHeight: 22 },
    suitSymbolRed: { color: '#ef4444' },
    suitLabel: { color: theme.text, fontSize: 14, fontWeight: '700' },
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
