import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
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
  monopolyEventBanner,
  monopolyEventSeqs,
  type MonopolyEventKind,
} from '@/components/games/monopoly/monopoly-status-messages'
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
  takenMonopolyTokens,
  type MonopolyTokenId,
} from '@fateround/shared/monopoly-tokens'
import { MONOPOLY_EDITION_THEMES } from '@fateround/shared/create-themes'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { MonopolyBoardView } from '@/components/games/monopoly/MonopolyBoardView'
import { MonopolyGameTimerBar } from '@/components/games/monopoly/MonopolyGameTimerBar'
import { MonopolyStatusCards } from '@/components/games/monopoly/MonopolyStatusCards'
import { MonopolyShareCard } from '@/components/games/monopoly/MonopolyShareCard'
import {
  formatThemedMoney,
  formatThemedText,
  themedSpaceName,
} from '@/components/games/monopoly/monopoly-theme'
import { useHeaderBadge } from '@/components/session/HeaderBadgeContext'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameExpiryTimer } from '@/hooks/useGameExpiryTimer'
import { joinGame } from '@/lib/api'
import {
  postMonopolyAuction,
  postMonopolyBuild,
  postMonopolyBuy,
  postMonopolyForfeit,
  postMonopolyJail,
  postMonopolyMortgage,
  postMonopolyExpireTurn,
  postMonopolyRent,
  postMonopolyRoll,
  postMonopolySettleDebt,
  postMonopolyTrade,
} from '@/lib/game-api'
import { useTurnExpiryTimer } from '@/hooks/useTurnExpiryTimer'
import {
  MonopolyManagePanel,
  type BuildAction,
  type MortgageAction,
  type TradeProposal,
} from '@/components/games/monopoly/MonopolyManagePanel'
import { MonopolyPlayerList } from '@/components/games/monopoly/MonopolyPlayerList'
import { MonopolyTradeModal } from '@/components/games/monopoly/MonopolyTradeModal'
import { getMonopolyBuildActionCount, normalizePendingTrade } from '@/components/games/monopoly/manage-logic'
import { getPlayerSession, setPlayerSession } from '@/lib/secure-session'
import { getSupabase } from '@/lib/supabase'
import { MONOPOLY_BOARD_SELECT, MONOPOLY_PLAYER_STATE_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { monopolyLeaderboard } from '@/lib/finish-leaderboards'
import { buildMonopolyStandings } from '@/lib/monopoly-standings'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

/**
 * Detects which board event (cash / rent / trade / card) most recently fired and
 * surfaces it transiently. Each event type has its OWN sequence counter, so we
 * watch every counter and flag whichever one just incremented — then auto-clear
 * after `ms`. This means a trade decline shows even while a stale cash seq is
 * higher, and notifications don't linger forever. Returns null when nothing is
 * currently fresh.
 */
function useMonopolyLatestEvent(
  seqs: { cash: number; rent: number; trade: number; card: number },
  ms = 6000
): MonopolyEventKind | null {
  const [active, setActive] = useState<MonopolyEventKind | null>(null)
  const prev = useRef(seqs)
  useEffect(() => {
    const p = prev.current
    // Later entries win if two counters advance in the same update (rare).
    let changed: MonopolyEventKind | null = null
    if (seqs.cash > p.cash) changed = 'cash'
    if (seqs.rent > p.rent) changed = 'rent'
    if (seqs.trade > p.trade) changed = 'trade'
    if (seqs.card > p.card) changed = 'card'
    prev.current = seqs
    if (!changed) return undefined
    setActive(changed)
    const t = setTimeout(() => setActive(null), ms)
    return () => clearTimeout(t)
  }, [seqs.cash, seqs.rent, seqs.trade, seqs.card, ms])
  return active
}

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
  // Bottom-panel tabs (mirrors web MonopolyActiveLayout `SidePanel`): 'build'
  // shows the Build & trade manage panel, 'players' shows the all-players list.
  const [panel, setPanel] = useState<'build' | 'players'>('build')
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  // Scroll-to-panel nudges: mobile renders the Build & trade panel inline (always
  // in the tree) but it lives far below the fold, so the web "open Build & trade"
  // nudges become "jump to Build & trade" affordances here. We capture the panel's
  // y offset in the scroll view and animate a single shared value on show.
  const scrollRef = useRef<ScrollView>(null)
  const managePanelYRef = useRef(0)
  const nudgeAnim = useRef(new Animated.Value(0)).current
  const scrollToManagePanel = useCallback(() => {
    setPanel('build')
    scrollRef.current?.scrollTo({ y: Math.max(managePanelYRef.current - 12, 0), animated: true })
  }, [])

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
  // Surface the chosen edition (🎩 Classic, 🇳🇬 Naija, …) as the header mode pill
  // so it's visible on every Monopoly screen, not just the create/lobby picker.
  const edition = MONOPOLY_EDITION_THEMES.find((t) => t.id === (themeId ?? 'default')) ?? MONOPOLY_EDITION_THEMES[0]
  useHeaderBadge(bootstrap.game ? `${edition.emoji} ${edition.label}` : null)
  // Joining an already-active game means watching live (read-only). Monopoly never
  // seats late players mid-game, so the active-game join is always a viewer join.
  const joiningAsViewer = bootstrap.game?.status === 'active'

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'monopoly_boards', 'monopoly_player_state', 'players'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  // End the game when the whole-game duration runs out. Without this the timer
  // bar drains to 0:00 but nothing tells the server to finish — matches web.
  useGameExpiryTimer({ endpoint: `/api/games/${gameCode}/expire-monopoly`, game: bootstrap.game })

  useEffect(() => {
    const id = setInterval(() => setTimerTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Seed a default token, but never clobber the player's own pick. This effect
  // re-runs on every realtime `players` update (heartbeats, other joins), so it
  // must preserve `selectedToken` as long as it's still free — only fall back to
  // the first available token when nothing is picked yet or the pick got taken.
  useEffect(() => {
    if (bootstrap.screen !== 'join') return
    const taken = takenMonopolyTokens(bootstrap.players)
    setSelectedToken((current) =>
      current && !taken.has(current) ? current : firstAvailableMonopolyToken(bootstrap.players)
    )
  }, [bootstrap.players, bootstrap.screen])

  // Transient event notifications — whichever event (cash/rent/trade/card) most
  // recently fired shows for a few seconds then auto-dismisses, so stale ones
  // don't linger and a fresh one (e.g. a trade decline) always appears.
  const eventSeqs = monopolyEventSeqs(
    board?.last_cash_event,
    board?.last_rent_event,
    board?.last_trade_event,
    board?.last_card_event
  )
  const activeEventKind = useMonopolyLatestEvent(eventSeqs)

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

  // Viewers have no Build & trade panel, so pin them to the Players tab.
  useEffect(() => {
    if (isViewer) setPanel('players')
  }, [isViewer])

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

  // In-flow nudges that jump the player to the always-inline Build & trade panel.
  // The incoming-trade case is already served by the full-screen MonopolyTradeModal
  // (which demands an immediate Accept/Decline), so only the build + raise-cash
  // nudges are surfaced here. Declared before any early return so the animation
  // effect below always runs (Rules of Hooks).
  const buildActions =
    board && bootstrap.myPlayerId ? getMonopolyBuildActionCount(board, bootstrap.myPlayerId) : 0
  const showBuildNudge = !isViewer && !myState?.bankrupt && buildActions > 0
  const showRaiseCashNudge = !isViewer && showRaiseFunds
  const showAnyNudge = showBuildNudge || showRaiseCashNudge

  useEffect(() => {
    if (showAnyNudge) {
      nudgeAnim.setValue(0)
      Animated.timing(nudgeAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start()
    }
    // Re-run when the set of visible nudges changes so each new nudge fades in.
  }, [showAnyNudge, showBuildNudge, showRaiseCashNudge, nudgeAnim])

  void timerTick
  const secondsLeft = secondsUntilMonopolyDeadline(board?.turn_deadline_at)

  // Opponent-driven fallback: the local auto-advance below only fires for the
  // player whose action it is (and only while their app is open). So any active
  // client also pokes the idempotent /expire-turn route once the deadline passes,
  // matching web — otherwise a disconnected player's turn hangs forever.
  useTurnExpiryTimer({
    deadlineAt: board?.turn_deadline_at,
    enabled: bootstrap.game?.status === 'active' && board?.phase !== 'finished',
    onExpire: () => postMonopolyExpireTurn(gameCode).then(() => bootstrap.load()),
  })

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

  // Client-side auto-advance: when the per-action deadline expires and it's the
  // local player's action, auto-submit the default (mirrors web's
  // useMonopolyDeadlineTimer auto callbacks: auto-roll, auto-pay rent, auto-pass
  // auction, auto-auction on buy, auto-forfeit on raise-funds). This is a safety
  // net alongside the server-side timeout so a stalled client still progresses.
  const autoActedRef = useRef<string | null>(null)
  const deadline = board?.turn_deadline_at ?? null
  useEffect(() => {
    if (!deadline || secondsLeft > 0 || acting || !bootstrap.myResumeToken) return
    const key = `${deadline}|${board?.phase ?? ''}`
    if (autoActedRef.current === key) return

    let fn: (() => Promise<unknown>) | null = null
    if (showRoll || showJail) {
      fn = () => postMonopolyRoll(bootstrap.code, bootstrap.myResumeToken!)
    } else if (showBuy) {
      fn = () => postMonopolyBuy(bootstrap.code, bootstrap.myResumeToken!, 'auction')
    } else if (showRent) {
      fn = () => postMonopolyRent(bootstrap.code, bootstrap.myResumeToken!)
    } else if (showAuction) {
      fn = () => postMonopolyAuction(bootstrap.code, bootstrap.myResumeToken!, 'pass')
    } else if (showRaiseFunds) {
      fn = () => postMonopolyForfeit(bootstrap.code, bootstrap.myResumeToken!)
    }
    if (!fn) return

    autoActedRef.current = key
    void act(fn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, secondsLeft, acting, showRoll, showJail, showBuy, showRent, showAuction, showRaiseFunds])

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
          {/* One horizontal row of chips that scrolls sideways, so a full
              6-player lobby stays on a single line instead of wrapping down. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.lobbyTokenRow}
          >
            {bootstrap.players
              .filter((p) => !p.spectator)
              .map((p: Player, index: number) => (
                <View key={p.id} style={styles.lobbyTokenChip}>
                  <Text style={styles.lobbyTokenEmoji}>{monopolyTokenEmoji(p.monopoly_token, index)}</Text>
                  <Text style={styles.lobbyTokenName} numberOfLines={1}>
                    {p.name}
                  </Text>
                </View>
              ))}
          </ScrollView>
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
        hideDefaultHeader
        notice={
          <MonopolyShareCard
            standings={standings}
            winnerName={winner?.name ?? null}
            gameTitle={bootstrap.game.title}
            themeId={themeId}
            highlightPlayerId={bootstrap.myPlayerId}
          />
        }
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

  const bannerPhaseOwnsMessaging =
    board.phase === 'buy' ||
    board.phase === 'pay_rent' ||
    board.phase === 'auction' ||
    board.phase === 'raise_funds'
  // Show the freshly-fired event (cash/rent/trade) as a transient banner; when
  // nothing is flashing, fall back to the persistent board status message
  // (unless a phase panel or a card event already owns the messaging).
  const eventBanner =
    activeEventKind && activeEventKind !== 'card'
      ? monopolyEventBanner(activeEventKind, {
          lastCashEvent: board.last_cash_event,
          lastRentEvent: board.last_rent_event,
          lastTradeEvent: board.last_trade_event,
          myPlayerId: bootstrap.myPlayerId,
          players: bootstrap.players,
          themeId,
        })
      : null
  const statusBanner =
    !activeEventKind && board.status_message && !bannerPhaseOwnsMessaging && !board.last_card_event
      ? { message: formatThemedText(board.status_message, themeId), personal: false }
      : null
  const visibleBanner = eventBanner ?? statusBanner

  // Current-space / cash chrome (mirrors web MonopolyCurrentSpace + MonopolyCashBadge).
  const mySpaceOwnerId = myState ? board.property_owners?.[String(myState.position)] : undefined
  const mySpace = myState ? spaceAt(myState.position) : null
  const ownable = !!(mySpace && (mySpace.type === 'property' || mySpace.type === 'station' || mySpace.type === 'utility'))
  const spaceOwnerLabel = !myState
    ? null
    : mySpaceOwnerId === bootstrap.myPlayerId
      ? 'You own this'
      : mySpaceOwnerId
        ? `Owned by ${bootstrap.players.find((p) => p.id === mySpaceOwnerId)?.name ?? 'a player'}`
        : ownable
          ? 'Unowned'
          : null

  const nudgeStyle = {
    opacity: nudgeAnim,
    transform: [{ translateY: nudgeAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
  }

  // The turn UI lives INSIDE the board center (mirrors web MonopolyBoardCenter):
  // currently-on + cash always show; dice show when idle; the contextual action
  // panel (roll / buy / rent / jail / auction / raise-funds) replaces the dice.
  const hasActionPanel = showBuy || showRent || showJail || showAuction || showRaiseFunds
  const boardCenter = (
    <View style={styles.center}>
      {myState ? (
        <>
          {mySpace ? (
            <Text style={styles.centerOn} numberOfLines={1}>
              On {themedSpaceName(mySpace.name, myState.position, themeId)}
            </Text>
          ) : null}
          <Text style={styles.centerCashLabel}>{myState.bankrupt ? 'BANKRUPT' : 'YOUR CASH'}</Text>
          <Text style={[styles.centerCash, myState.bankrupt && styles.centerCashBankrupt]}>
            {formatThemedMoney(myState.cash, themeId)}
          </Text>
        </>
      ) : null}

      {!hasActionPanel && board.last_dice ? (
        <View style={styles.dieRow}>
          <View style={styles.die}>
            <Text style={styles.dieText}>{board.last_dice.d1}</Text>
          </View>
          <View style={styles.die}>
            <Text style={styles.dieText}>{board.last_dice.d2}</Text>
          </View>
          <Text style={styles.dieTotal}>
            {board.last_dice.total}
            {board.last_dice.doubles ? ' ••' : ''}
          </Text>
        </View>
      ) : null}

      {secondsLeft > 0 ? (
        <View style={styles.centerTimer}>
          <Text style={styles.centerTimerText}>{secondsLeft}s</Text>
        </View>
      ) : null}

      {showRoll ? (
        <Pressable
          style={[styles.centerPrimary, acting && styles.btnDisabled]}
          disabled={acting}
          onPress={() => void act(() => postMonopolyRoll(bootstrap.code, bootstrap.myResumeToken!))}
        >
          <Text style={styles.centerPrimaryText}>🎲 Roll</Text>
        </Pressable>
      ) : null}

      {showBuy && pendingSpace ? (
        <View style={styles.centerPanel}>
          <Text style={styles.centerTitle} numberOfLines={1}>
            {themedSpaceName(pendingSpace.name, pendingSpace.index, themeId)}
          </Text>
          <Text style={styles.centerSub}>{formatThemedMoney(pendingSpace.price ?? 0, themeId)}</Text>
          <View style={styles.centerRow}>
            <Pressable
              style={[styles.centerPrimary, styles.centerFlex, acting && styles.btnDisabled]}
              disabled={acting || (myState?.cash ?? 0) < (pendingSpace.price ?? 0)}
              onPress={() => void act(() => postMonopolyBuy(bootstrap.code, bootstrap.myResumeToken!, 'buy'))}
            >
              <Text style={styles.centerPrimaryText}>Buy</Text>
            </Pressable>
            <Pressable
              style={[styles.centerSecondary, styles.centerFlex, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => void act(() => postMonopolyBuy(bootstrap.code, bootstrap.myResumeToken!, 'auction'))}
            >
              <Text style={styles.centerSecondaryText}>Auction</Text>
            </Pressable>
            <Pressable
              style={[styles.centerSecondary, styles.centerFlex, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => void act(() => postMonopolyBuy(bootstrap.code, bootstrap.myResumeToken!, 'pass'))}
            >
              <Text style={styles.centerSecondaryText}>Pass</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {showRent && pendingSpace ? (
        <View style={styles.centerPanel}>
          <Text style={styles.centerTitle} numberOfLines={1}>
            Rent · {themedSpaceName(pendingSpace.name, pendingSpace.index, themeId)}
          </Text>
          <Pressable
            style={[styles.centerPrimary, acting && styles.btnDisabled]}
            disabled={acting}
            onPress={() => void act(() => postMonopolyRent(bootstrap.code, bootstrap.myResumeToken!))}
          >
            <Text style={styles.centerPrimaryText}>Pay rent</Text>
          </Pressable>
        </View>
      ) : null}

      {showJail ? (
        <View style={styles.centerPanel}>
          <Text style={styles.centerTitle}>In jail</Text>
          <Text style={styles.centerSub}>
            {(myState?.jail_turns ?? 0) + 1}/3 · pay {formatThemedMoney(MONOPOLY_JAIL_FINE, themeId)}
          </Text>
          <View style={styles.centerRow}>
            <Pressable
              style={[styles.centerPrimary, styles.centerFlex, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => void act(() => postMonopolyRoll(bootstrap.code, bootstrap.myResumeToken!))}
            >
              <Text style={styles.centerPrimaryText}>Roll</Text>
            </Pressable>
            <Pressable
              style={[styles.centerSecondary, styles.centerFlex, acting && styles.btnDisabled]}
              disabled={acting || (myState?.cash ?? 0) < MONOPOLY_JAIL_FINE}
              onPress={() => void act(() => postMonopolyJail(bootstrap.code, bootstrap.myResumeToken!, 'pay'))}
            >
              <Text style={styles.centerSecondaryText}>Pay fine</Text>
            </Pressable>
          </View>
          {(myState?.get_out_of_jail_free ?? 0) > 0 ? (
            <Pressable
              style={[styles.centerSecondary, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => void act(() => postMonopolyJail(bootstrap.code, bootstrap.myResumeToken!, 'card'))}
            >
              <Text style={styles.centerSecondaryText}>Use jail card</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {showAuction && auction && auctionSpace ? (
        <View style={styles.centerPanel}>
          <Text style={styles.centerTitle} numberOfLines={1}>
            Auction · {themedSpaceName(auctionSpace.name, auction.space_index, themeId)}
          </Text>
          <Text style={styles.centerSub}>
            High: {auction.high_bid > 0 ? formatThemedMoney(auction.high_bid, themeId) : 'None'}
          </Text>
          <TextInput
            style={styles.centerInput}
            value={bidAmount}
            onChangeText={setBidAmount}
            keyboardType="number-pad"
            placeholder={`Min ${auction.high_bid + 1}`}
            placeholderTextColor={theme.textFaint}
          />
          <View style={styles.centerRow}>
            <Pressable
              style={[styles.centerPrimary, styles.centerFlex, acting && styles.btnDisabled]}
              disabled={acting || !bidAmount || Number(bidAmount) <= auction.high_bid}
              onPress={() =>
                void act(() =>
                  postMonopolyAuction(bootstrap.code, bootstrap.myResumeToken!, 'bid', Number(bidAmount))
                )
              }
            >
              <Text style={styles.centerPrimaryText}>Bid</Text>
            </Pressable>
            <Pressable
              style={[styles.centerSecondary, styles.centerFlex, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => void act(() => postMonopolyAuction(bootstrap.code, bootstrap.myResumeToken!, 'pass'))}
            >
              <Text style={styles.centerSecondaryText}>Pass</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {showRaiseFunds && debt ? (
        <View style={styles.centerPanel}>
          <Text style={styles.centerTitle}>Raise {formatThemedMoney(debt.amount, themeId)}</Text>
          <View style={styles.centerRow}>
            <Pressable
              style={[styles.centerPrimary, styles.centerFlex, acting && styles.btnDisabled]}
              disabled={acting || (myState?.cash ?? 0) < debt.amount}
              onPress={() => void act(() => postMonopolySettleDebt(bootstrap.code, bootstrap.myResumeToken!, 'pay'))}
            >
              <Text style={styles.centerPrimaryText}>Pay</Text>
            </Pressable>
            <Pressable
              style={[styles.centerSecondary, styles.centerFlex, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => void act(() => postMonopolyForfeit(bootstrap.code, bootstrap.myResumeToken!))}
            >
              <Text style={styles.centerSecondaryText}>Forfeit</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!isMyTurn && !showAuction && !showRaiseFunds ? (
        <Text style={styles.centerWaiting} numberOfLines={1}>
          {turnName}&apos;s turn
        </Text>
      ) : null}
    </View>
  )

  // Read-only board centre for spectators — mirrors the web MonopolyActiveLayout
  // viewer center: the last roll, a "Watching live" label, and the status message.
  // (Whose turn lives in the status cards above the board, like web's turn strip.)
  const spectatorCenter = (
    <View style={styles.center}>
      {board.last_dice ? (
        <View style={styles.dieRow}>
          <View style={styles.die}>
            <Text style={styles.dieText}>{board.last_dice.d1}</Text>
          </View>
          <View style={styles.die}>
            <Text style={styles.dieText}>{board.last_dice.d2}</Text>
          </View>
          <Text style={styles.dieTotal}>
            {board.last_dice.total}
            {board.last_dice.doubles ? ' ••' : ''}
          </Text>
        </View>
      ) : null}
      <Text style={styles.specTurnName} numberOfLines={1}>
        {turnName}
        <Text style={styles.specTurnSuffix}>&apos;s turn</Text>
      </Text>
      <Text style={styles.centerWatchLabel}>WATCHING LIVE</Text>
      {board.status_message ? (
        <Text style={styles.centerWatchMsg} numberOfLines={4}>
          {formatThemedText(board.status_message, themeId)}
        </Text>
      ) : null}
    </View>
  )

  return (
    <GameShell bootstrap={bootstrap} title={batch8GameLabel('monopoly')}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.playContent}>
        <MonopolyGameTimerBar game={bootstrap.game} />

        <MonopolyStatusCards
          isMyTurn={!!isMyTurn}
          turnName={turnName}
          secondsLeft={secondsLeft}
          phaseLabel={monopolyPhaseLabel(board.phase)}
          spaceName={mySpace ? themedSpaceName(mySpace.name, myState!.position, themeId) : null}
          spaceOwnerLabel={spaceOwnerLabel}
          banner={visibleBanner}
        />

        {showRaiseCashNudge ? (
          <Animated.View style={nudgeStyle}>
            <Pressable style={[styles.nudge, styles.nudgeDanger]} onPress={scrollToManagePanel}>
              <Text style={[styles.nudgeText, styles.nudgeDangerText]}>
                ⚠️ Raise cash — mortgage or sell buildings below
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {showBuildNudge ? (
          <Animated.View style={nudgeStyle}>
            <Pressable style={[styles.nudge, styles.nudgeBuild]} onPress={scrollToManagePanel}>
              <Text style={[styles.nudgeText, styles.nudgeBuildText]}>
                🏠 You can build on your properties — tap to jump to Build &amp; trade
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}

        <MonopolyBoardView
          states={states}
          players={bootstrap.players}
          propertyOwners={board.property_owners}
          pendingSpace={board.pending_space}
          myPlayerId={bootstrap.myPlayerId}
          themeId={themeId}
          center={isViewer ? spectatorCenter : boardCenter}
        />

        {board.last_card_event && activeEventKind === 'card' ? (
          <View style={styles.cardEvent}>
            <Text style={styles.cardKind}>{board.last_card_event.kind === 'chance' ? 'Chance' : 'Community Chest'}</Text>
            <Text style={styles.cardText}>{formatThemedText(board.last_card_event.card_message, themeId)}</Text>
          </View>
        ) : null}

        {showRaiseFunds && debt ? (
          <Text style={styles.raiseReason}>{formatThemedText(debt.reason, themeId)}</Text>
        ) : null}

        {manageError ? <Text style={styles.errorText}>{manageError}</Text> : null}

        {/* Tabbed bottom panel — Build & trade / Players (mirrors web). */}
        <View style={styles.panelWrap} onLayout={(e) => (managePanelYRef.current = e.nativeEvent.layout.y)}>
          {isViewer ? (
            <Text style={styles.panelLabel}>Players</Text>
          ) : (
            <View style={styles.tabBar}>
              <Pressable
                style={[styles.tab, panel === 'build' && styles.tabActive]}
                onPress={() => setPanel('build')}
              >
                <Text style={[styles.tabText, panel === 'build' && styles.tabTextActive]}>Build &amp; trade</Text>
                {buildActions > 0 ? (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{buildActions}</Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                style={[styles.tab, panel === 'players' && styles.tabActive]}
                onPress={() => setPanel('players')}
              >
                <Text style={[styles.tabText, panel === 'players' && styles.tabTextActive]}>Players</Text>
              </Pressable>
            </View>
          )}

          {!isViewer && panel === 'build' ? (
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
          ) : (
            <MonopolyPlayerList
              states={states}
              players={bootstrap.players}
              currentPlayerId={turnPlayerId}
              propertyOwners={board.property_owners}
              myPlayerId={bootstrap.myPlayerId}
              themeId={themeId}
            />
          )}
        </View>
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
  lobbyTokenRow: { flexDirection: 'row', gap: 8, marginTop: 8, paddingRight: 8 },
  lobbyTokenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  lobbyTokenEmoji: { fontSize: 18 },
  lobbyTokenName: { color: theme.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  playContent: { padding: 16, gap: 12, paddingBottom: 40 },
  chromeRow: { flexDirection: 'row', gap: 8 },
  chromeSpace: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  chromeCash: {
    minWidth: 108,
    backgroundColor: theme.primarySoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.borderAccent,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  chromeCashBankrupt: { backgroundColor: theme.surface, borderColor: theme.border },
  chromeLabel: {
    color: theme.textFaint,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  chromeSpaceName: { color: theme.text, fontSize: 15, fontWeight: '800', marginTop: 2 },
  chromeSpaceOwner: { color: theme.textMuted, fontSize: 12, marginTop: 1 },
  chromeCashValue: { color: theme.primary, fontSize: 18, fontWeight: '800', marginTop: 2 },
  chromeCashValueBankrupt: { color: theme.textMuted },
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerPersonal: { backgroundColor: theme.primarySoft, borderColor: theme.borderAccent },
  bannerNeutral: { backgroundColor: theme.surface, borderColor: theme.border },
  bannerTag: {
    color: theme.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 3,
  },
  bannerText: { color: theme.text, fontSize: 14, lineHeight: 20 },
  nudge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  nudgeText: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  nudgeBuild: { backgroundColor: theme.primarySoft, borderColor: theme.borderAccent },
  nudgeBuildText: { color: theme.primary },
  nudgeDanger: { backgroundColor: '#ef44441a', borderColor: '#ef444455' },
  nudgeDangerText: { color: '#ef4444' },
  errorText: { color: theme.primary, fontSize: 13, fontWeight: '600' },
  dice: { color: theme.text, fontSize: 16, fontWeight: '600' },
  cardEvent: { backgroundColor: theme.surface, borderRadius: 12, padding: 12, gap: 4 },
  cardKind: { color: '#fbbf24', fontSize: 12, textTransform: 'uppercase' },
  cardText: { color: theme.text, fontSize: 14 },
  panelWrap: { gap: 12 },
  panelLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 2,
  },
  // Pill tab bar (mirrors web's inset tablist): a rounded inset track with two
  // segments; the active tab is a raised/filled surface.
  tabBar: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 14,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 8,
  },
  tabActive: {
    backgroundColor: theme.surface,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: theme.text },
  tabBadge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
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
  spaceOwnerLine: { color: theme.textMuted, fontSize: 12, textAlign: 'center' },
  raiseReason: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
  // Board-center turn UI. Sits on the (dark) board centre, so it carries its own
  // translucent dark card and uses light text for readability on any edition palette.
  center: {
    // No card — the turn UI sits directly on the board's centre felt (mirrors web).
    alignItems: 'center',
    gap: 3,
    width: '100%',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  centerOn: { color: 'rgba(255,255,255,0.9)', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  centerCashLabel: {
    color: 'rgba(251,191,36,0.85)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 1,
  },
  // Bright amber, large + bold so the amount is unmistakable on the board.
  centerCash: { color: '#fbbf24', fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  centerCashBankrupt: { color: '#fca5a5' },
  dieRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  die: { width: 22, height: 22, borderRadius: 5, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  dieText: { color: '#111827', fontSize: 13, fontWeight: '800' },
  dieTotal: { color: '#ffffff', fontSize: 12, fontWeight: '700', marginLeft: 2 },
  centerTimer: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1, marginTop: 2 },
  centerTimerText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  centerPanel: { alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'stretch' },
  centerTitle: { color: '#ffffff', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  centerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 10, textAlign: 'center' },
  centerRow: { flexDirection: 'row', gap: 6, marginTop: 4, alignSelf: 'stretch' },
  centerFlex: { flex: 1 },
  centerPrimary: {
    backgroundColor: '#f59e0b',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  centerPrimaryText: { color: '#1f2937', fontWeight: '800', fontSize: 13 },
  centerSecondary: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  centerSecondaryText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  centerInput: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
    color: '#111827',
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: 'center',
    marginTop: 2,
  },
  centerWaiting: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', marginTop: 2 },
  specTurnName: { color: '#ffffff', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  specTurnSuffix: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  centerWatchLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  centerWatchMsg: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 2,
  },
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
