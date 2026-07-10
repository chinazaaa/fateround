import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type Game, type Player, type WhotPlayerHand, type WhotSession, type WhotShape } from '@fateround/shared'
import { batch4GameLabel } from '@fateround/shared/batch-4-games'
import {
  WHOT_SHAPE_LABELS,
  canPlayCard,
  cardLabel,
  currentPlayerId,
  getActivePickPenalty,
  hasActiveWhotCall,
  hasPlayableCard,
  isDrawPileDepleted,
  parseWhotRules,
} from '@fateround/shared/whot'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { FinishedPanel, GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postWhotChooseNumber, postWhotChooseShape, postWhotDraw, postWhotPlay } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { WHOT_PLAYER_HANDS_SELECT, WHOT_SESSION_SELECT } from '@/lib/supabase-selects'

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
  const penalty = session ? getActivePickPenalty(session) : null
  const choosingWhot = session?.phase === 'choose_whot' && isMyTurn

  const playableIds = useMemo(() => {
    if (!session || !myHand) return new Set<string>()
    return new Set(myHand.cards.filter((c) => canPlayCard(c, session, rules)).map((c) => c.id))
  }, [session, myHand, rules])

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

  const playCard = (cardId: string) => act(() => postWhotPlay(bootstrap.code, bootstrap.myResumeToken!, cardId))

  const chooseShape = (shape: WhotShape) =>
    act(() => postWhotChooseShape(bootstrap.code, bootstrap.myResumeToken!, shape))

  const chooseNumber = (number: number) =>
    act(() => postWhotChooseNumber(bootstrap.code, bootstrap.myResumeToken!, number))

  const drawCard = () => act(() => postWhotDraw(bootstrap.code, bootstrap.myResumeToken!))

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
  if (!bootstrap.game || !session) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === session.winner_player_id)
    return (
      <GameShell title={batch4GameLabel('whot')} subtitle={bootstrap.code}>
        <FinishedPanel title="Game over" detail={winner ? `${winner.name} wins` : undefined} />
      </GameShell>
    )
  }

  const turnName = bootstrap.players.find((p) => p.id === turnPlayerId)?.name ?? 'Someone'
  const topLabel = session.top_card ? cardLabel(session.top_card) : '—'
  const canDraw =
    isMyTurn &&
    session.phase === 'playing' &&
    !choosingWhot &&
    (!myHand || !hasPlayableCard(myHand.cards, session, rules) || isDrawPileDepleted(session))

  const penaltyLabel =
    penalty?.type === 'pick2'
      ? `Pick 2 — play a 2 or draw ${penalty.count}`
      : penalty?.type === 'pick3'
        ? `Pick 3 — play a 5 or draw ${penalty.count}`
        : null

  return (
    <GameShell title={batch4GameLabel('whot')} subtitle={bootstrap.code}>
      <TurnBanner text={session.status_message ?? `${turnName}'s turn`} isMyTurn={isMyTurn} />
      <View style={styles.table}>
        <Text style={styles.label}>Top card</Text>
        <Text style={styles.topCard}>{topLabel}</Text>
        {hasActiveWhotCall(session) && session.required_shape ? (
          <Text style={styles.hint}>Must match {WHOT_SHAPE_LABELS[session.required_shape]}</Text>
        ) : null}
        {penaltyLabel ? <Text style={styles.hint}>{penaltyLabel}</Text> : null}
      </View>

      {choosingWhot && isMyTurn ? (
        <View style={styles.choosePanel}>
          <Text style={styles.section}>Call the next play</Text>
          <Text style={styles.shapeHint}>Shape</Text>
          <View style={styles.shapeRow}>
            {WHOT_CALL_SHAPES.map((shape) => (
              <Pressable key={shape} style={styles.callBtn} disabled={acting} onPress={() => void chooseShape(shape)}>
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
              style={[styles.card, playable && isMyTurn && styles.cardPlayable]}
              disabled={acting || !isMyTurn || !playable || session.phase !== 'playing'}
              onPress={() => playCard(card.id)}
            >
              <Text style={styles.cardText}>{cardLabel(card)}</Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {canDraw ? (
        <Pressable style={styles.drawBtn} disabled={acting} onPress={() => void drawCard()}>
          <Text style={styles.drawText}>Draw card</Text>
        </Pressable>
      ) : null}
    </GameShell>
  )
}

const styles = StyleSheet.create({
  table: { backgroundColor: '#17171d', borderRadius: 12, padding: 16, gap: 6 },
  label: { color: '#9ca3af', fontSize: 13 },
  topCard: { color: '#fff', fontSize: 24, fontWeight: '800' },
  hint: { color: '#fbbf24', fontSize: 14 },
  section: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 4 },
  choosePanel: { gap: 8 },
  shapeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shapeHint: { color: '#9ca3af', fontSize: 12 },
  numberRow: { gap: 6, paddingVertical: 4 },
  callBtn: { backgroundColor: '#3f1d2b', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  callText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  hand: { gap: 8, paddingVertical: 8 },
  card: {
    backgroundColor: '#2a2a35',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#3f3f50',
    minWidth: 80,
    alignItems: 'center',
  },
  cardPlayable: { borderColor: '#f43f5e', backgroundColor: '#3f1d2b' },
  cardText: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
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
