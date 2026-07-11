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
  MONOPOLY_JAIL_FINE,
  spaceAt,
} from '@fateround/shared/monopoly-board'
import {
  currentPlayerId,
  monopolyPhaseLabel,
  secondsUntilMonopolyDeadline,
} from '@fateround/shared/monopoly'
import { playerIsViewer } from '@fateround/shared/viewers'
import {
  firstAvailableMonopolyToken,
  MONOPOLY_PLAYER_TOKENS,
  monopolyTokenEmoji,
  monopolyTokenOwners,
  type MonopolyTokenId,
} from '@fateround/shared/monopoly-tokens'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { MonopolyBoardView } from '@/components/games/monopoly/MonopolyBoardView'
import {
  formatThemedMoney,
  formatThemedText,
  themedSpaceName,
} from '@/components/games/monopoly/monopoly-theme'
import { ViewerModeBanner } from '@/components/lifecycle/ViewerModeBanner'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { joinGame } from '@/lib/api'
import {
  postMonopolyAuction,
  postMonopolyBuild,
  postMonopolyBuy,
  postMonopolyForfeit,
  postMonopolyJail,
  postMonopolyMortgage,
  postMonopolyRent,
  postMonopolyRoll,
  postMonopolySettleDebt,
  postMonopolyTrade,
} from '@/lib/game-api'
import {
  MonopolyManagePanel,
  type BuildAction,
  type MortgageAction,
  type TradeProposal,
} from '@/components/games/monopoly/MonopolyManagePanel'
import { MonopolyTradeModal } from '@/components/games/monopoly/MonopolyTradeModal'
import { normalizePendingTrade } from '@/components/games/monopoly/manage-logic'
import { getPlayerSession, setPlayerSession } from '@/lib/secure-session'
import { getSupabase } from '@/lib/supabase'
import { MONOPOLY_BOARD_SELECT, MONOPOLY_PLAYER_STATE_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { monopolyLeaderboard } from '@/lib/finish-leaderboards'
import { buildMonopolyStandings } from '@/lib/monopoly-standings'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

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
  const [manageError, setManageError] = useState<string | null>(null)
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

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
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  const themeId = bootstrap.game?.theme
  // Joining an already-active game means watching live (read-only). Monopoly never
  // seats late players mid-game, so the active-game join is always a viewer join.
  const joiningAsViewer = bootstrap.game?.status === 'active'

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
    if (!joiningAsViewer && !selectedToken) {
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
        joinAsViewer: joiningAsViewer ? true : undefined,
        monopolyToken: joiningAsViewer ? undefined : selectedToken,
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
  const me = bootstrap.myPlayerId ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) : undefined
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId && !myState?.bankrupt && !isViewer

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'playing',
  })

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

  const runManage = async (fn: () => Promise<unknown>) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    setManageError(null)
    try {
      await fn()
      await bootstrap.load()
    } catch (err) {
      setManageError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActing(false)
    }
  }

  const onBuild = (spaceIndex: number, action: BuildAction) =>
    void runManage(() => postMonopolyBuild(bootstrap.code, bootstrap.myResumeToken!, spaceIndex, action))
  const onMortgage = (spaceIndex: number, action: MortgageAction) =>
    void runManage(() => postMonopolyMortgage(bootstrap.code, bootstrap.myResumeToken!, spaceIndex, action))
  const onProposeTrade = (proposal: TradeProposal) =>
    void runManage(() => postMonopolyTrade(bootstrap.code, bootstrap.myResumeToken!, proposal))
  const onCancelTrade = () =>
    void runManage(() => postMonopolyTrade(bootstrap.code, bootstrap.myResumeToken!, { cancel: true }))
  const onRepairTrade = () =>
    void runManage(() => postMonopolyTrade(bootstrap.code, bootstrap.myResumeToken!, { repair: true }))
  const onRespondTrade = (accept: boolean) =>
    void runManage(() => postMonopolyTrade(bootstrap.code, bootstrap.myResumeToken!, { accept }))

  const tokenOwners = useMemo(() => monopolyTokenOwners(bootstrap.players), [bootstrap.players])

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />

  if (bootstrap.screen === 'join' && bootstrap.game) {
    return (
      <ScrollView style={styles.joinWrap} contentContainerStyle={styles.joinContent}>
        {joiningAsViewer ? (
          <View style={styles.viewerNote}>
            <Text style={styles.viewerNoteTitle}>Watching live</Text>
            <Text style={styles.viewerNoteBody}>
              This game is already in progress — enter your name and join as a viewer to watch the board update in
              real time (read-only).
            </Text>
          </View>
        ) : null}
        <JoinScreen
          gameCode={bootstrap.code}
          joinName={bootstrap.joinName}
          joining={bootstrap.joining || joiningToken}
          error={joinError ?? bootstrap.error}
          onChangeName={bootstrap.setJoinName}
          onJoin={() => void joinWithToken()}
        />
        {joiningAsViewer ? null : (
          <>
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
          </>
        )}
      </ScrollView>
    )
  }

  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return (
      <View style={styles.waitingWrap}>
        <LobbyView {...lobbyProps!} onLeft={onLeft} />
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
    const standings = buildMonopolyStandings(
      states,
      bootstrap.players,
      board?.property_owners,
      board?.property_buildings,
      board?.mortgaged_properties
    )
    return (
      <GameFinishPanel
        bootstrap={bootstrap}
        title={winner ? `${winner.name} wins!` : 'Game over'}
        subtitle="Final standings"
        leaderboard={monopolyLeaderboard(standings, bootstrap.myPlayerId)}
        winnerPlayerId={board?.winner_player_id}
        roundKey={board?.id}
      />
    )
  }

  if (!bootstrap.game || !board) return <GameLoading />

  const turnName = bootstrap.players.find((p) => p.id === turnPlayerId)?.name ?? 'Player'

  const pendingTrade = board.pending_trade ? normalizePendingTrade(board.pending_trade) : null
  const incomingTrade =
    pendingTrade &&
    pendingTrade.to_player_id === bootstrap.myPlayerId &&
    bootstrap.players.some((p) => p.id === pendingTrade.from_player_id) &&
    bootstrap.players.some((p) => p.id === pendingTrade.to_player_id)
      ? pendingTrade
      : null

  return (
    <GameShell bootstrap={bootstrap} title={batch8GameLabel('monopoly')} subtitle={monopolyPhaseLabel(board.phase)}>
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

        {isViewer && me ? (
          <ViewerModeBanner
            gameCode={bootstrap.code}
            playerId={bootstrap.myPlayerId!}
            game={bootstrap.game}
            player={me}
            players={bootstrap.players}
            onPromoted={() => void bootstrap.load()}
          />
        ) : null}

        {board.status_message ? (
          <Text style={styles.status}>{formatThemedText(board.status_message, themeId)}</Text>
        ) : null}

        <MonopolyBoardView
          states={states}
          players={bootstrap.players}
          propertyOwners={board.property_owners}
          pendingSpace={board.pending_space}
          myPlayerId={bootstrap.myPlayerId}
          themeId={themeId}
        />

        {secondsLeft > 0 ? <TimerBadge seconds={secondsLeft} /> : null}

        {board.last_dice ? (
          <Text style={styles.dice}>
            Dice: {board.last_dice.d1} + {board.last_dice.d2} = {board.last_dice.total}
            {board.last_dice.doubles ? ' (doubles)' : ''}
          </Text>
        ) : null}

        {board.last_card_event ? (
          <View style={styles.cardEvent}>
            <Text style={styles.cardKind}>{board.last_card_event.kind === 'chance' ? 'Chance' : 'Community Chest'}</Text>
            <Text style={styles.cardText}>{formatThemedText(board.last_card_event.card_message, themeId)}</Text>
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
                  {formatThemedMoney(state.cash, themeId)} · {themedSpaceName(space.name, state.position, themeId)}
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
            <Text style={styles.actionTitle}>{themedSpaceName(pendingSpace.name, pendingSpace.index, themeId)}</Text>
            <Text style={styles.actionSub}>Price {formatThemedMoney(pendingSpace.price ?? 0, themeId)}</Text>
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
            <Text style={styles.actionTitle}>Pay rent — {themedSpaceName(pendingSpace.name, pendingSpace.index, themeId)}</Text>
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
              Attempt {(myState?.jail_turns ?? 0) + 1}/3 — roll for doubles or pay {formatThemedMoney(MONOPOLY_JAIL_FINE, themeId)}.
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
            <Text style={styles.actionTitle}>Auction — {themedSpaceName(auctionSpace.name, auction.space_index, themeId)}</Text>
            <Text style={styles.actionSub}>
              High bid: {auction.high_bid > 0 ? formatThemedMoney(auction.high_bid, themeId) : 'None'}
            </Text>
            <TextInput
              style={styles.bidInput}
              value={bidAmount}
              onChangeText={setBidAmount}
              keyboardType="number-pad"
              placeholder={`Min ${auction.high_bid + 1}`}
              placeholderTextColor={theme.textFaint}
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
            <Text style={styles.actionTitle}>Raise {formatThemedMoney(debt.amount, themeId)}</Text>
            <Text style={styles.actionSub}>{formatThemedText(debt.reason, themeId)}</Text>
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

        {manageError ? <Text style={styles.errorText}>{manageError}</Text> : null}

        {isViewer ? null : (
          <MonopolyManagePanel
            board={board}
            myPlayerId={bootstrap.myPlayerId}
            myState={myState}
            states={states}
            players={bootstrap.players}
            acting={acting}
            themeId={themeId}
            onBuild={onBuild}
            onMortgage={onMortgage}
            onProposeTrade={onProposeTrade}
            onCancelTrade={onCancelTrade}
            onRepairTrade={onRepairTrade}
          />
        )}
      </ScrollView>

      {incomingTrade ? (
        <MonopolyTradeModal
          trade={incomingTrade}
          players={bootstrap.players}
          acting={acting}
          themeId={themeId}
          onRespond={onRespondTrade}
        />
      ) : null}
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  waitingWrap: { flex: 1, backgroundColor: theme.bg },
  tokenList: { paddingHorizontal: 20, paddingBottom: 24 },
  joinWrap: { flex: 1, backgroundColor: theme.bg },
  joinContent: { paddingBottom: 32 },
  viewerNote: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: theme.primarySoft,
    borderColor: theme.borderAccent,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  viewerNoteTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
  viewerNoteBody: { color: theme.textSecondary, fontSize: 13, lineHeight: 18 },
  tokenHeading: { color: theme.text, fontSize: 16, fontWeight: '600', paddingHorizontal: 24, marginTop: 8 },
  tokenGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16 },
  tokenBtn: {
    width: '30%',
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 10,
    alignItems: 'center',
  },
  tokenBtnActive: { borderColor: theme.primary },
  tokenBtnTaken: { opacity: 0.45 },
  tokenEmoji: { fontSize: 24 },
  tokenLabel: { color: theme.text, fontSize: 11, marginTop: 4, textAlign: 'center' },
  tokenOwner: { color: theme.textMuted, fontSize: 10, marginTop: 2 },
  lobbyHint: { color: theme.textMuted, fontSize: 14, marginTop: 12 },
  lobbyToken: { color: theme.text, fontSize: 15, marginTop: 4 },
  playContent: { padding: 16, gap: 12, paddingBottom: 40 },
  status: { color: theme.textSecondary, fontSize: 14 },
  errorText: { color: theme.primary, fontSize: 13, fontWeight: '600' },
  dice: { color: theme.text, fontSize: 16, fontWeight: '600' },
  cardEvent: { backgroundColor: theme.surface, borderRadius: 12, padding: 12, gap: 4 },
  cardKind: { color: '#fbbf24', fontSize: 12, textTransform: 'uppercase' },
  cardText: { color: theme.text, fontSize: 14 },
  scores: { gap: 8 },
  scoreRow: { backgroundColor: theme.surface, borderRadius: 10, padding: 10 },
  scoreRowActive: { borderColor: theme.primary, borderWidth: 1 },
  scoreName: { color: theme.text, fontSize: 15, fontWeight: '600' },
  scoreMeta: { color: theme.textMuted, fontSize: 13, marginTop: 2 },
  actionPanel: { backgroundColor: theme.surface, borderRadius: 12, padding: 14, gap: 10 },
  actionTitle: { color: theme.text, fontSize: 17, fontWeight: '700' },
  actionSub: { color: theme.textMuted, fontSize: 13 },
  actionRow: { flexDirection: 'row', gap: 8 },
  flexBtn: { flex: 1 },
  primaryBtn: {
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  // white on the solid rose button — intentional
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    backgroundColor: theme.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: theme.text, fontWeight: '600', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  bidInput: {
    backgroundColor: theme.bg,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'center',
  },
})
