import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  type MonopolyBoard,
  type MonopolyPlayerState,
  type Player,
  normalizeGameCode,
} from '@fateround/shared'
import { batch8GameLabel } from '@fateround/shared/batch-8-games'
import {
  formatMonopolyMoney,
  MONOPOLY_JAIL_FINE,
  spaceAt,
} from '@fateround/shared/monopoly-board'
import {
  currentPlayerId,
  monopolyPhaseLabel,
  secondsUntilMonopolyDeadline,
} from '@fateround/shared/monopoly'
import {
  firstAvailableMonopolyToken,
  MONOPOLY_PLAYER_TOKENS,
  monopolyTokenEmoji,
  monopolyTokenOwners,
  type MonopolyTokenId,
} from '@fateround/shared/monopoly-tokens'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { FinishedPanel, GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { joinGame } from '@/lib/api'
import {
  postMonopolyAuction,
  postMonopolyBuy,
  postMonopolyForfeit,
  postMonopolyJail,
  postMonopolyRent,
  postMonopolyRoll,
  postMonopolySettleDebt,
} from '@/lib/game-api'
import { getPlayerSession, setPlayerSession } from '@/lib/secure-session'
import { getSupabase } from '@/lib/supabase'
import { MONOPOLY_BOARD_SELECT, MONOPOLY_PLAYER_STATE_SELECT } from '@/lib/supabase-selects'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function MonopolyPlayerView({ gameCode }: { gameCode: string }) {
  const [board, setBoard] = useState<MonopolyBoard | null>(null)
  const [states, setStates] = useState<MonopolyPlayerState[]>([])
  const [acting, setActing] = useState(false)
  const [bidAmount, setBidAmount] = useState('')
  const [selectedToken, setSelectedToken] = useState<MonopolyTokenId | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joiningToken, setJoiningToken] = useState(false)
  const [timerTick, setTimerTick] = useState(0)

  const loadGameState = useCallback(async (): Promise<{ state: MonopolyBoard | null; ok: boolean }> => {
    const code = gameCode.toUpperCase()
    const [boardRes, statesRes] = await Promise.all([
      getSupabase().from('monopoly_boards').select(MONOPOLY_BOARD_SELECT).eq('game_id', code).maybeSingle(),
      getSupabase()
        .from('monopoly_player_state')
        .select(MONOPOLY_PLAYER_STATE_SELECT)
        .eq('game_id', code)
        .order('player_order'),
    ])
    if (boardRes.error || statesRes.error) return { state: null, ok: false }
    const boardData = boardRes.data as MonopolyBoard | null
    setBoard(boardData)
    setStates((statesRes.data as MonopolyPlayerState[]) ?? [])
    return { state: boardData, ok: true }
  }, [gameCode])

  const bootstrap = useGameViewBootstrap<Screen, MonopolyBoard | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen: (game, playerId, boardData) => {
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'finished' || boardData?.phase === 'finished') return 'finished'
      if (game.status === 'active') return 'playing'
      return 'waiting'
    },
  })

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'monopoly_boards', 'monopoly_player_state', 'players'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  useEffect(() => {
    const id = setInterval(() => setTimerTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (bootstrap.screen !== 'join') return
    const free = firstAvailableMonopolyToken(bootstrap.players)
    setSelectedToken(free)
  }, [bootstrap.players, bootstrap.screen])

  const joinWithToken = async () => {
    const playerName = bootstrap.joinName.trim()
    if (!playerName) {
      setJoinError('Enter your name to join')
      return
    }
    if (!selectedToken) {
      setJoinError('Pick an available token')
      return
    }
    setJoiningToken(true)
    setJoinError(null)
    try {
      const code = normalizeGameCode(gameCode)
      const existing = await getPlayerSession(code)
      const data = await joinGame({
        gameCode: code,
        playerName,
        resumeToken: existing?.resumeToken ?? undefined,
        monopolyToken: selectedToken,
      })
      await setPlayerSession(code, data.playerId, data.playerName, data.playerGender ?? 'both', data.resumeToken ?? null)
      await bootstrap.load()
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setJoiningToken(false)
    }
  }

  const turnPlayerId = board ? currentPlayerId(board) : null
  const myState = states.find((s) => s.player_id === bootstrap.myPlayerId)
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId && !myState?.bankrupt
  const pendingSpace = board?.pending_space != null ? spaceAt(board.pending_space) : null
  const auction = board?.auction_state
  const auctionSpace = auction ? spaceAt(auction.space_index) : null
  const debt = board?.pending_debt
  const isMyDebt = debt?.player_id === bootstrap.myPlayerId
  const isMyAuctionTurn = auction?.current_bidder_id === bootstrap.myPlayerId

  const showRoll = !!(isMyTurn && board?.phase === 'roll' && !myState?.in_jail)
  const showBuy = !!(isMyTurn && board?.phase === 'buy' && pendingSpace)
  const showRent = !!(isMyTurn && board?.phase === 'pay_rent' && pendingSpace)
  const showJail = !!(isMyTurn && board?.phase === 'jail' && myState?.in_jail)
  const showAuction = !!(board?.phase === 'auction' && auction && isMyAuctionTurn)
  const showRaiseFunds = !!(isMyDebt && board?.phase === 'raise_funds' && debt)

  void timerTick
  const secondsLeft = secondsUntilMonopolyDeadline(board?.turn_deadline_at)

  const act = async (fn: () => Promise<unknown>) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await fn()
      setBidAmount('')
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  const tokenOwners = useMemo(() => monopolyTokenOwners(bootstrap.players), [bootstrap.players])

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />

  if (bootstrap.screen === 'join' && bootstrap.game) {
    return (
      <ScrollView style={styles.joinWrap} contentContainerStyle={styles.joinContent}>
        <JoinScreen
          gameCode={bootstrap.code}
          joinName={bootstrap.joinName}
          joining={bootstrap.joining || joiningToken}
          error={joinError ?? bootstrap.error}
          onChangeName={bootstrap.setJoinName}
          onJoin={() => void joinWithToken()}
        />
        <Text style={styles.tokenHeading}>Pick your token</Text>
        <View style={styles.tokenGrid}>
          {MONOPOLY_PLAYER_TOKENS.map((token) => {
            const owner = tokenOwners.get(token.id)
            const taken = !!owner
            const selected = selectedToken === token.id
            return (
              <Pressable
                key={token.id}
                style={[styles.tokenBtn, selected && styles.tokenBtnActive, taken && styles.tokenBtnTaken]}
                disabled={taken || bootstrap.joining || joiningToken}
                onPress={() => setSelectedToken(token.id)}
              >
                <Text style={styles.tokenEmoji}>{token.emoji}</Text>
                <Text style={styles.tokenLabel}>{token.label}</Text>
                {owner ? <Text style={styles.tokenOwner}>{owner}</Text> : null}
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
    )
  }

  if (bootstrap.screen === 'waiting' && bootstrap.game) {
    return (
      <View style={styles.waitingWrap}>
        <LobbyView game={bootstrap.game} players={bootstrap.players} myPlayerId={bootstrap.myPlayerId} />
        <View style={styles.tokenList}>
          <Text style={styles.lobbyHint}>Tokens in lobby:</Text>
          {bootstrap.players
            .filter((p) => !p.spectator)
            .map((p: Player, index: number) => (
              <Text key={p.id} style={styles.lobbyToken}>
                {monopolyTokenEmoji(p.monopoly_token, index)} {p.name}
              </Text>
            ))}
        </View>
      </View>
    )
  }

  if (bootstrap.screen === 'finished' && bootstrap.game) {
    const winner = bootstrap.players.find((p) => p.id === board?.winner_player_id)
    return (
      <FinishedPanel
        title={batch8GameLabel('monopoly')}
        detail={winner ? `${winner.name} wins!` : 'Game over'}
      />
    )
  }

  if (!bootstrap.game || !board) return <GameLoading />

  const turnName = bootstrap.players.find((p) => p.id === turnPlayerId)?.name ?? 'Player'

  return (
    <GameShell title={batch8GameLabel('monopoly')} subtitle={monopolyPhaseLabel(board.phase)}>
      <ScrollView contentContainerStyle={styles.playContent}>
        <TurnBanner
          isMyTurn={!!isMyTurn}
          text={
            secondsLeft > 0
              ? `${isMyTurn ? 'Your turn' : `${turnName}'s turn`} · ${secondsLeft}s`
              : isMyTurn
                ? 'Your turn'
                : `${turnName}'s turn`
          }
        />

        {board.status_message ? <Text style={styles.status}>{board.status_message}</Text> : null}

        {board.last_dice ? (
          <Text style={styles.dice}>
            Dice: {board.last_dice.d1} + {board.last_dice.d2} = {board.last_dice.total}
            {board.last_dice.doubles ? ' (doubles)' : ''}
          </Text>
        ) : null}

        {board.last_card_event ? (
          <View style={styles.cardEvent}>
            <Text style={styles.cardKind}>{board.last_card_event.kind === 'chance' ? 'Chance' : 'Community Chest'}</Text>
            <Text style={styles.cardText}>{board.last_card_event.card_message}</Text>
          </View>
        ) : null}

        <View style={styles.scores}>
          {states.map((state, index) => {
            const player = bootstrap.players.find((p) => p.id === state.player_id)
            const space = spaceAt(state.position)
            return (
              <View key={state.id} style={[styles.scoreRow, state.player_id === turnPlayerId && styles.scoreRowActive]}>
                <Text style={styles.scoreName}>
                  {monopolyTokenEmoji(player?.monopoly_token, index)} {player?.name ?? 'Player'}
                  {state.bankrupt ? ' (bankrupt)' : ''}
                </Text>
                <Text style={styles.scoreMeta}>
                  {formatMonopolyMoney(state.cash)} · {space.name}
                  {state.in_jail ? ' · Jail' : ''}
                </Text>
              </View>
            )
          })}
        </View>

        {showRoll ? (
          <Pressable
            style={[styles.primaryBtn, acting && styles.btnDisabled]}
            disabled={acting}
            onPress={() => void act(() => postMonopolyRoll(bootstrap.code, bootstrap.myResumeToken!))}
          >
            <Text style={styles.primaryBtnText}>Roll dice</Text>
          </Pressable>
        ) : null}

        {showBuy && pendingSpace ? (
          <View style={styles.actionPanel}>
            <Text style={styles.actionTitle}>{pendingSpace.name}</Text>
            <Text style={styles.actionSub}>Price {formatMonopolyMoney(pendingSpace.price ?? 0)}</Text>
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.primaryBtn, styles.flexBtn, acting && styles.btnDisabled]}
                disabled={acting || (myState?.cash ?? 0) < (pendingSpace.price ?? 0)}
                onPress={() => void act(() => postMonopolyBuy(bootstrap.code, bootstrap.myResumeToken!, 'buy'))}
              >
                <Text style={styles.primaryBtnText}>Buy</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, styles.flexBtn, acting && styles.btnDisabled]}
                disabled={acting}
                onPress={() => void act(() => postMonopolyBuy(bootstrap.code, bootstrap.myResumeToken!, 'auction'))}
              >
                <Text style={styles.secondaryBtnText}>Auction</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, styles.flexBtn, acting && styles.btnDisabled]}
                disabled={acting}
                onPress={() => void act(() => postMonopolyBuy(bootstrap.code, bootstrap.myResumeToken!, 'pass'))}
              >
                <Text style={styles.secondaryBtnText}>Pass</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {showRent && pendingSpace ? (
          <View style={styles.actionPanel}>
            <Text style={styles.actionTitle}>Pay rent — {pendingSpace.name}</Text>
            <Pressable
              style={[styles.primaryBtn, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => void act(() => postMonopolyRent(bootstrap.code, bootstrap.myResumeToken!))}
            >
              <Text style={styles.primaryBtnText}>Pay rent</Text>
            </Pressable>
          </View>
        ) : null}

        {showJail ? (
          <View style={styles.actionPanel}>
            <Text style={styles.actionTitle}>In jail</Text>
            <Text style={styles.actionSub}>
              Attempt {(myState?.jail_turns ?? 0) + 1}/3 — roll for doubles or pay {formatMonopolyMoney(MONOPOLY_JAIL_FINE)}.
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.primaryBtn, styles.flexBtn, acting && styles.btnDisabled]}
                disabled={acting}
                onPress={() => void act(() => postMonopolyRoll(bootstrap.code, bootstrap.myResumeToken!))}
              >
                <Text style={styles.primaryBtnText}>Roll doubles</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, styles.flexBtn, acting && styles.btnDisabled]}
                disabled={acting || (myState?.cash ?? 0) < MONOPOLY_JAIL_FINE}
                onPress={() => void act(() => postMonopolyJail(bootstrap.code, bootstrap.myResumeToken!, 'pay'))}
              >
                <Text style={styles.secondaryBtnText}>Pay fine</Text>
              </Pressable>
            </View>
            {(myState?.get_out_of_jail_free ?? 0) > 0 ? (
              <Pressable
                style={[styles.secondaryBtn, acting && styles.btnDisabled]}
                disabled={acting}
                onPress={() => void act(() => postMonopolyJail(bootstrap.code, bootstrap.myResumeToken!, 'card'))}
              >
                <Text style={styles.secondaryBtnText}>Use get-out-of-jail card</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {showAuction && auction && auctionSpace ? (
          <View style={styles.actionPanel}>
            <Text style={styles.actionTitle}>Auction — {auctionSpace.name}</Text>
            <Text style={styles.actionSub}>
              High bid: {auction.high_bid > 0 ? formatMonopolyMoney(auction.high_bid) : 'None'}
            </Text>
            <TextInput
              style={styles.bidInput}
              value={bidAmount}
              onChangeText={setBidAmount}
              keyboardType="number-pad"
              placeholder={`Min ${auction.high_bid + 1}`}
              placeholderTextColor="#6b7280"
            />
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.primaryBtn, styles.flexBtn, acting && styles.btnDisabled]}
                disabled={acting || !bidAmount || Number(bidAmount) <= auction.high_bid}
                onPress={() =>
                  void act(() =>
                    postMonopolyAuction(bootstrap.code, bootstrap.myResumeToken!, 'bid', Number(bidAmount))
                  )
                }
              >
                <Text style={styles.primaryBtnText}>Bid</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, styles.flexBtn, acting && styles.btnDisabled]}
                disabled={acting}
                onPress={() => void act(() => postMonopolyAuction(bootstrap.code, bootstrap.myResumeToken!, 'pass'))}
              >
                <Text style={styles.secondaryBtnText}>Pass</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {showRaiseFunds && debt ? (
          <View style={styles.actionPanel}>
            <Text style={styles.actionTitle}>Raise {formatMonopolyMoney(debt.amount)}</Text>
            <Text style={styles.actionSub}>{debt.reason}</Text>
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.primaryBtn, styles.flexBtn, acting && styles.btnDisabled]}
                disabled={acting || (myState?.cash ?? 0) < debt.amount}
                onPress={() => void act(() => postMonopolySettleDebt(bootstrap.code, bootstrap.myResumeToken!, 'pay'))}
              >
                <Text style={styles.primaryBtnText}>Pay debt</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, styles.flexBtn, acting && styles.btnDisabled]}
                disabled={acting}
                onPress={() => void act(() => postMonopolyForfeit(bootstrap.code, bootstrap.myResumeToken!))}
              >
                <Text style={styles.secondaryBtnText}>Forfeit</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </GameShell>
  )
}

const styles = StyleSheet.create({
  waitingWrap: { flex: 1, backgroundColor: '#0b0b0f' },
  tokenList: { paddingHorizontal: 20, paddingBottom: 24 },
  joinWrap: { flex: 1, backgroundColor: '#0b0b0f' },
  joinContent: { paddingBottom: 32 },
  tokenHeading: { color: '#fff', fontSize: 16, fontWeight: '600', paddingHorizontal: 24, marginTop: 8 },
  tokenGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16 },
  tokenBtn: {
    width: '30%',
    backgroundColor: '#17171d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a35',
    padding: 10,
    alignItems: 'center',
  },
  tokenBtnActive: { borderColor: '#f43f5e' },
  tokenBtnTaken: { opacity: 0.45 },
  tokenEmoji: { fontSize: 24 },
  tokenLabel: { color: '#fff', fontSize: 11, marginTop: 4, textAlign: 'center' },
  tokenOwner: { color: '#9ca3af', fontSize: 10, marginTop: 2 },
  lobbyHint: { color: '#9ca3af', fontSize: 14, marginTop: 12 },
  lobbyToken: { color: '#fff', fontSize: 15, marginTop: 4 },
  playContent: { padding: 16, gap: 12, paddingBottom: 40 },
  status: { color: '#d1d5db', fontSize: 14 },
  dice: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cardEvent: { backgroundColor: '#17171d', borderRadius: 12, padding: 12, gap: 4 },
  cardKind: { color: '#fbbf24', fontSize: 12, textTransform: 'uppercase' },
  cardText: { color: '#fff', fontSize: 14 },
  scores: { gap: 8 },
  scoreRow: { backgroundColor: '#17171d', borderRadius: 10, padding: 10 },
  scoreRowActive: { borderColor: '#f43f5e', borderWidth: 1 },
  scoreName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  scoreMeta: { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  actionPanel: { backgroundColor: '#17171d', borderRadius: 12, padding: 14, gap: 10 },
  actionTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  actionSub: { color: '#9ca3af', fontSize: 13 },
  actionRow: { flexDirection: 'row', gap: 8 },
  flexBtn: { flex: 1 },
  primaryBtn: {
    backgroundColor: '#f43f5e',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    backgroundColor: '#2a2a35',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  bidInput: {
    backgroundColor: '#0b0b0f',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 10,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'center',
  },
})
