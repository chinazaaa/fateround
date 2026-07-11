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
import { CardTableArea } from '@/components/games/cards/CardTableArea'
import { PlayerTurnRail } from '@/components/games/cards/PlayerTurnRail'
import { PlayingCardFace } from '@/components/games/cards/PlayingCardFace'
import { useTurnDeadlineSeconds } from '@/components/games/cards/useTurnDeadlineSeconds'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postCrazyEightsChoose, postCrazyEightsDraw, postCrazyEightsPlay } from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { CRAZY8_PLAYER_HANDS_SELECT, CRAZY8_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { winnerLeaderboard } from '@/lib/finish-leaderboards'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

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
    if (!playerId) return 'join'
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

  const playableIds = useMemo(() => {
    if (!session || !myHand) return new Set<string>()
    return new Set(myHand.cards.filter((c) => canPlayCard(c, session, rules)).map((c) => c.id))
  }, [session, myHand, rules])

  const timerSeconds = useTurnDeadlineSeconds(
    crazyEightsSecondsLeft,
    session?.turn_deadline_at,
    !!session?.turn_deadline_at && session.phase === 'playing'
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
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('crazy_eights')} subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title={winner ? `${winner.name} wins!` : 'Game over'} subtitle="Final standings" leaderboard={winnerLeaderboard(session.winner_player_id, bootstrap.players, bootstrap.myPlayerId)} winnerPlayerId={session.winner_player_id} roundKey={session.id} />
      </GameShell>
    )
  }

  const turnName = bootstrap.players.find((p) => p.id === turnPlayerId)?.name ?? 'Someone'
  const tableHint = [
    hasActiveSuitCall(session) && session.required_suit
      ? `Must follow ${CRAZY8_SUIT_LABELS[session.required_suit]}`
      : null,
    penalties.pickTwo > 0 ? `Pick ${penalties.pickTwo} penalty` : null,
    penalties.jokerPenalty > 0 ? `Joker penalty: draw ${penalties.jokerPenalty}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const drawDepleted = isDrawPileDepleted(session)
  const myCanPlay = myHand ? hasPlayableCard(myHand.cards, session, rules) : false
  const suitCallActive = hasActiveSuitCall(session)

  // "Out" = our dealt hand row is loaded and now empty (we played our last card and went
  // out). Guard on the row actually being loaded — a not-yet-fetched hand is briefly empty
  // and must not flip a still-playing player into the watch-only UI.
  const isOut = !!myHand && myHand.cards.length === 0 && session.phase !== 'choose_suit'

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
      <TurnBanner text={session.status_message ?? `${turnName}'s turn`} isMyTurn={isMyTurn && !isOut} />
      {timerSeconds > 0 ? <TimerBadge seconds={timerSeconds} /> : null}

      {isOut ? (
        <View style={styles.outBanner}>
          <Text style={styles.outTitle}>You&apos;re out</Text>
          <Text style={styles.outSub}>You played all your cards — watch until the game ends.</Text>
        </View>
      ) : null}

      {directionChip}

      <PlayerTurnRail
        players={bootstrap.players}
        turnPlayerId={turnPlayerId}
        myPlayerId={bootstrap.myPlayerId}
        handCounts={handCounts}
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

      {choosingSuit ? (
        <View style={styles.suitRow}>
          {SUITS.map((suit) => (
            <Pressable key={suit} style={styles.actionBtn} disabled={acting} onPress={() => void chooseSuit(suit)}>
              <Text style={styles.actionText}>{CRAZY8_SUIT_LABELS[suit]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {isOut ? null : (
        <>
          {isMyTurn && session.phase === 'playing' ? <Text style={styles.turnHint}>{turnHint}</Text> : null}

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
                  <PlayingCardFace
                    card={card}
                    playable={playable && isMyTurn}
                    specialLabel={specialCardShortLabel(card, rules)}
                  />
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
      )}
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  emptyTop: { color: theme.text, fontSize: 28, fontWeight: '800' },
  section: { color: theme.text, fontSize: 16, fontWeight: '600', marginTop: 4 },
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
  hand: { gap: 8, paddingVertical: 8 },
  suitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  // white on the solid rose action button — intentional
  actionText: { color: '#fff', fontWeight: '700' },
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
