import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  type Game,
  type Player,
  type UnoCard,
  type UnoColor,
  type UnoPlayerHand,
  type UnoSession,
} from '@fateround/shared'
import { batch4GameLabel } from '@fateround/shared/batch-4-games'
import {
  UNO_COLORS,
  UNO_COLOR_HEX,
  UNO_COLOR_LABELS,
  activeColor,
  canPlayCard,
  cardShortLabel,
  currentPlayerId,
  hasPlayableCard,
  isDrawPileDepleted,
  isJumpInMatch,
  multiSetGroupingOk,
  parseUnoRules,
  unoSecondsLeft,
  unoTeammateId,
  validateMultiSet,
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
import { GameInfoChips } from '@/components/GameInfoChips'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { useGamePlacements, useGameStats } from '@/components/session/RosterDrawerContext'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { UnoSeriesScoreboard } from '@/components/games/cards/UnoSeriesScoreboard'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useUnoMercyKnockoutAlerts } from '@/hooks/useUnoMercyKnockoutAlerts'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import {
  postUnoCallUno,
  postUnoChallenge,
  postUnoChooseColor,
  postUnoDraw,
  postUnoExpireTurn,
  postUnoJumpIn,
  postUnoPass,
  postUnoPlay,
  postUnoPlayMulti,
  postUnoHands,
  postUnoSwap,
  postUnoTeamLeaveDecision,
} from '@/lib/game-api'
import { getPlayerSession } from '@/lib/secure-session'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { UNO_SESSION_SELECT, isCompleteUnoSessionRow } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { cardHandLeaderboard } from '@/lib/finish-leaderboards'
import { useUnoQuickChat } from '@/hooks/useUnoQuickChat'
import { UNO_QUICK_MESSAGES, unoQuickMessage } from '@/lib/uno-quick-messages'

/**
 * PHASE 2 — this view drives the full ruleset: classic play, stacking, the Wild Draw
 * Four challenge window, the missed-"UNO" call penalty, the 0/7 rule, Jump-In
 * (out-of-turn exact matches), Multi-Play (laying several matching cards at once),
 * Team-Up 2v2 (partner hand panel, quick-chat, the `team_leave_decision` phase), and
 * the partner-only quick-chat emote channel.
 */

function ordinal(n: number): string {
  const j = n % 10
  const k = n % 100
  if (j === 1 && k !== 11) return `${n}st`
  if (j === 2 && k !== 12) return `${n}nd`
  if (j === 3 && k !== 13) return `${n}rd`
  return `${n}th`
}

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
  // Authoritative resume token, mirrored to a ref so the hand fetch (defined before the bootstrap
  // resolves the token) can fall back to it. See the fetch + effect below.
  const myResumeTokenRef = useRef<string | null>(null)
  // Live mirror for the realtime apply fast-path — a subscription callback
  // can't read `session` directly (stale closure).
  const sessionRef = useRef<UnoSession | null>(null)
  sessionRef.current = session

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: UnoSession | null; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      // Hands via /api/uno/hands so other players' cards never reach this device; own cards come
      // back in full, everyone else's as `card_count`. In Team-Up mode the caller's teammate's
      // hand also comes back in full (resolved server-side). See src/lib/hand-redaction.ts.
      const session = await getPlayerSession(code)
      const [sessionRes, handsRes] = await Promise.all([
        getSupabase().from('uno_sessions').select(UNO_SESSION_SELECT).eq('game_id', code).maybeSingle(),
        // Fall back to the bootstrap-resolved token: this runs BEFORE the player is resolved on
        // the first load, so for a share-link player the stored session isn't written yet, and a
        // tokenless request makes the redaction route blank our OWN hand — which reads as "you
        // are out". The effect below re-fetches once the token lands.
        postUnoHands(code, { resumeToken: session?.resumeToken ?? myResumeTokenRef.current ?? undefined }).catch(
          () => null
        ),
      ])
      if (sessionRes.error || !handsRes) return { state: null, ok: false }
      const sessionData = sessionRes.data as UnoSession | null
      setSession(sessionData)
      setHands(handsRes.hands ?? [])
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
  myResumeTokenRef.current = bootstrap.myResumeToken

  // The first hand fetch can run before the resume token is resolved, which the redaction route
  // answers with our own hand blanked. Re-fetch with the authoritative token once it lands.
  useEffect(() => {
    const token = bootstrap.myResumeToken
    if (!token || bootstrap.game?.status !== 'active') return
    let cancelled = false
    void postUnoHands(gameCode.toUpperCase(), { resumeToken: token })
      .then((res) => {
        if (!cancelled && res) setHands(res.hands ?? [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [bootstrap.myResumeToken, bootstrap.game?.status, gameCode])

  // Delta fast-path — mirrors web UnoPlayerView. Session + hand row changes
  // patch local state without a full reload; games row changes still reload so
  // the active→finished screen swap flows through the bootstrap.
  const applySessionRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as UnoSession
    const prev = sessionRef.current
    if (prev && next.updated_at && prev.updated_at && next.updated_at < prev.updated_at) return true
    // TOAST-column trap: a partial realtime update carrying null for the piles /
    // turn order would blank the board — fall back to reload for those.
    if (!isCompleteUnoSessionRow(row)) return false
    const merged = prev ? { ...prev, ...next } : next
    setSession(merged)
    sessionRef.current = merged
    return prev != null
  }, [])
  const applyHandRow = useCallback(
    (row: Record<string, unknown>): boolean => {
      const next = row as unknown as UnoPlayerHand
      const myPlayerId = bootstrap.myPlayerId
      // Once `cards` is revoked from anon, realtime payloads carry no cards at all. Applying one
      // verbatim to OUR OWN row would blank the hand — and because the out-check is derived from
      // an empty hand, it would read as "you are out" mid-game. In Team-Up the same is true of the
      // teammate's row: we're authorized to see their cards, but a redacted payload would blank
      // the partner panel until the next full load. For either, re-fetch through the authorized
      // route instead of applying the payload. Mirrors the web view.
      // `bootstrap.game?.uno_team_mode`, not `rules.teamMode`: `rules` is declared further down
      // the component, so referencing it here would be a use-before-declaration. Same source the
      // web view reads.
      const teammateId =
        bootstrap.game?.uno_team_mode === true && myPlayerId
          ? unoTeammateId(sessionRef.current?.turn_order ?? [], myPlayerId)
          : null
      const isSelfOrTeammate = next.player_id === myPlayerId || next.player_id === teammateId
      if (isSelfOrTeammate && myPlayerId && !Array.isArray(next.cards)) {
        void postUnoHands(gameCode.toUpperCase(), {
          resumeToken: myResumeTokenRef.current ?? undefined,
        })
          .then((res) => {
            if (res) setHands(res.hands ?? [])
          })
          .catch(() => {})
        return true
      }
      // Can the new count be derived from this payload? A redacted opponent row carries neither
      // `cards` nor `card_count` (the latter is computed by the route, not a column).
      const countable = Array.isArray(next.cards) || typeof next.card_count === 'number'
      setHands((prev) => {
        const i = prev.findIndex((h) => h.id === next.id)
        const merged: UnoPlayerHand = {
          ...next,
          // Carry a known count forward when the payload omits it, so an opponent never
          // momentarily renders as holding zero cards while the reload is in flight.
          card_count: next.card_count ?? (Array.isArray(next.cards) ? next.cards.length : prev[i]?.card_count),
        }
        if (i === -1) return [...prev, merged].sort((a, b) => a.player_order - b.player_order)
        const copy = [...prev]
        copy[i] = merged
        return copy
      })
      // Returning true for an uncountable row would skip useGameTableSync's reconciling reload —
      // the only path that can learn the new count — freezing every opponent's count for the rest
      // of the game, so "UNO!" would never show.
      return countable
    },
    [gameCode, bootstrap.myPlayerId, bootstrap.game?.uno_team_mode]
  )

  useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      { table: 'uno_sessions', apply: applySessionRow },
      { table: 'uno_player_hands', apply: applyHandRow },
    ],
    () => bootstrap.load(),
    !!bootstrap.game,
    bootstrap.game?.status
  )

  const rules = parseUnoRules(bootstrap.game)
  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId
  const myHand = hands.find((h) => h.player_id === bootstrap.myPlayerId)

  const me = bootstrap.myPlayerId ? (bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) ?? null) : null
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))
  // `cards: null` means REDACTED (the route couldn't resolve us), NOT "no cards left" — only an
  // actual empty array means the hand is genuinely empty. Without the Array.isArray check a token
  // race silently flips a still-playing player into watching mode for the rest of the game.
  // The guard belongs on `emptiedHand`, not on `isOut`: dev split the two so that elimination
  // (`knockedOut`) is tracked separately, and `emptiedHand` is what drives both the finish
  // position and the "you went out" copy.
  const emptiedHand =
    !!myHand && Array.isArray(myHand.cards) && myHand.cards.length === 0 && bootstrap.game?.status === 'active'
  const knockedOut =
    !!bootstrap.myPlayerId &&
    (session?.eliminated_player_ids ?? []).includes(bootstrap.myPlayerId) &&
    bootstrap.game?.status === 'active'
  const isOut = emptiedHand || knockedOut
  const isWatching = isViewer || isOut
  // Finish position among players who've emptied their hand — 1st = round winner.
  const finishPosition = (() => {
    if (!emptiedHand || !bootstrap.myPlayerId) return null
    const order = session?.finish_order ?? []
    const idx = order.indexOf(bootstrap.myPlayerId)
    return idx >= 0 ? idx + 1 : null
  })()

  // Desync guard (mirrors Whot/Crazy Eights — see docs memory "card-hand-desync"): the
  // hands table loaded (other players' rows are present) but none of them is ours —
  // our session player id doesn't match the id the game dealt a hand to (typically after
  // a rejoin that minted a new player id with no dealt hand). Show a recovery state
  // instead of falling through to a misleading empty "Your hand (0)" (= "you won").
  const handMissing =
    !isWatching && !myHand && hands.length > 0 && bootstrap.game?.status === 'active' && bootstrap.screen === 'playing'

  // Team-Up: your teammate's hand is visible to you (read-only), never to opponents.
  const partner = useMemo(() => {
    if (!rules.teamMode || !session || !bootstrap.myPlayerId || isWatching) return null
    const mateId = unoTeammateId(session.turn_order ?? [], bootstrap.myPlayerId)
    if (!mateId) return null
    if ((session.left_player_ids ?? []).includes(mateId)) return null
    const mateCards = hands.find((h) => h.player_id === mateId)?.cards ?? []
    const mateName = bootstrap.players.find((p) => p.id === mateId)?.name ?? 'Partner'
    return { id: mateId, name: mateName, cards: mateCards }
  }, [rules.teamMode, session, bootstrap.myPlayerId, isWatching, hands, bootstrap.players])

  const quickChatEnabled = !!partner && bootstrap.game?.status === 'active' && bootstrap.screen === 'playing'
  const {
    incoming: quickChatIncoming,
    send: sendQuickMessage,
    dismiss: dismissQuickMessage,
  } = useUnoQuickChat(bootstrap.code, bootstrap.myPlayerId, quickChatEnabled)
  const [quickPickerOpen, setQuickPickerOpen] = useState(false)

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'playing',
  })

  useUnoMercyKnockoutAlerts({
    session,
    players: bootstrap.players,
    myPlayerId: bootstrap.myPlayerId,
    enabled: bootstrap.screen === 'playing',
  })

  // Colour choice — two sub-states.
  // * choosingColor: classic Wild/+4 flow (choose_color) OR the very start of a Colour
  //   Roulette when the target hasn't picked yet (required_color null).
  // * rouletteDrawing: after the roulette target picks, they reveal cards one at a time
  //   via the Draw button (the picker must be hidden or it would still cover the screen
  //   and the Draw guard at `canDraw` — phase='playing' only — would refuse).
  const choosingColor =
    isMyTurn && (session?.phase === 'choose_color' || (session?.phase === 'color_roulette' && !session.required_color))
  const rouletteDrawing = isMyTurn && session?.phase === 'color_roulette' && !!session.required_color
  const inChallengeWindow = session?.phase === 'challenge_window' && isMyTurn
  const inSwapTarget = session?.phase === 'swap_target' && isMyTurn
  const owesUnoCall = !!session && session.uno_pending_player === bootstrap.myPlayerId && !session.uno_called

  const playableIds = useMemo(() => {
    if (!session || !myHand) return new Set<string>()
    return new Set((myHand.cards ?? []).filter((c) => canPlayCard(c, session)).map((c) => c.id))
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
    for (const hand of hands) counts[hand.player_id] = hand.card_count ?? hand.cards?.length ?? 0
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
      // Realtime fast-path (applySessionRow / applyHandRow above) merges the
      // server write into local state — no need to burn a full re-fetch here.
      setActing(false)
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

  const jumpIn = (cardId: string) => {
    playSound('card')
    return act(() => postUnoJumpIn(bootstrap.code, bootstrap.myResumeToken!, cardId, owesUnoCall))
  }

  const [multiMode, setMultiMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const exitMultiMode = () => {
    setMultiMode(false)
    setSelectedIds([])
  }
  const playMulti = (cardIds: string[]) => {
    playSound('card')
    return act(() => postUnoPlayMulti(bootstrap.code, bootstrap.myResumeToken!, cardIds, owesUnoCall))
  }

  const teamLeaveDecision = (decision: 'continue' | 'forfeit') =>
    act(() => postUnoTeamLeaveDecision(bootstrap.code, bootstrap.myResumeToken!, decision))

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
        infoChips={<GameInfoChips game={bootstrap.game} />}
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
          points: cards.reduce((sum, c) => {
            if (c.kind === 'number') return sum + (c.value ?? 0)
            const wildKinds = ['wild', 'wild_draw4', 'wild_reverse_draw4', 'wild_color_roulette']
            const drawWilds = ['draw6', 'draw10']
            if (wildKinds.includes(c.kind) || drawWilds.includes(c.kind)) return sum + 50
            return sum + 20 // coloured action card
          }, 0),
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
          notice={
            // Series scoring turns the room into a best-of, so the hand's result is only half
            // the story — the running total and the target are the part players care about.
            // Renders nothing when the host didn't enable series scoring.
            <UnoSeriesScoreboard
              game={bootstrap.game}
              players={bootstrap.players}
              highlightPlayerId={bootstrap.myPlayerId}
            />
          }
        />
      </GameShell>
    )
  }

  const turnName = bootstrap.players.find((p) => p.id === turnPlayerId)?.name ?? 'Someone'
  const demandColor = activeColor(session)
  const demandLabel = demandColor ? `Must play ${UNO_COLOR_LABELS[demandColor]}` : null
  const penaltyKindLabel = (() => {
    switch (session.draw_penalty_kind) {
      case 'draw2':
        return 'Draw 2'
      case 'wild_draw4':
        return 'Draw 4'
      case 'draw6':
        return 'Draw 6'
      case 'draw10':
        return 'Draw 10'
      case 'wild_reverse_draw4':
        return 'Reverse Draw 4'
      default:
        return null
    }
  })()
  const penaltyLabel =
    (session.draw_penalty ?? 0) > 0
      ? `Draw ${session.draw_penalty}${penaltyKindLabel ? ` — stack a ${penaltyKindLabel} (or higher in High Stakes) or draw` : ''}`
      : null
  const tableHint = [demandLabel, penaltyLabel].filter(Boolean).join(' · ')

  const drawDepleted = isDrawPileDepleted(session)
  const canPlayNow = !!myHand && hasPlayableCard(myHand.cards ?? [], session)
  const canDraw = isMyTurn && session.phase === 'playing' && !session.drawn_card_id && !(drawDepleted && canPlayNow)
  const canPass = isMyTurn && session.phase === 'playing' && !!session.drawn_card_id
  const drawLabel = drawDepleted ? 'Pass turn' : 'Draw a card'

  const top = session.top_card
  // Jump-In: out of turn, play an exact match for the settled top card. Only while the pile is
  // settled (no pending Draw penalty) and it isn't already your turn.
  const canJumpIn =
    rules.jumpIn && !isWatching && !isMyTurn && session.phase === 'playing' && (session.draw_penalty ?? 0) === 0
  const jumpableCards = canJumpIn && myHand ? (myHand.cards ?? []).filter((c) => isJumpInMatch(c, top)) : []
  const canJumpNow = jumpableCards.length > 0

  // ── Multi-Play selection ──────────────────────────────────────────────────────
  const hasDrawn = isMyTurn && session.phase === 'playing' && session.drawn_card_id != null
  const multiEnabled =
    isMyTurn &&
    !isWatching &&
    session.phase === 'playing' &&
    !hasDrawn &&
    (session.draw_penalty ?? 0) === 0 &&
    rules.multiPlay !== 'off' &&
    (myHand?.cards?.length ?? 0) >= 2
  const handById = new Map((myHand?.cards ?? []).map((c) => [c.id, c]))
  const selectedCards = selectedIds.map((id) => handById.get(id)).filter((c): c is UnoCard => !!c)
  const multiValid =
    multiMode && selectedCards.length >= 2 && validateMultiSet(selectedCards, session, rules.multiPlay) === null
  const canAddToSet = (card: UnoCard): boolean => {
    if (card.color === 'wild') return false
    if (selectedCards.length === 0) return canPlayCard(card, session)
    return multiSetGroupingOk([...selectedCards, card], rules.multiPlay)
  }
  const toggleSelect = (card: UnoCard) => {
    setSelectedIds((prev) =>
      prev.includes(card.id) ? prev.filter((id) => id !== card.id) : canAddToSet(card) ? [...prev, card.id] : prev
    )
  }
  const enterMultiMode = () => {
    setMultiMode(true)
    setSelectedIds([])
  }

  const orderedPlayers = (() => {
    const byId = new Map(bootstrap.players.map((p) => [p.id, p]))
    const seated = (session.turn_order ?? []).map((id) => byId.get(id)).filter((p): p is Player => !!p)
    const seatedIds = new Set(seated.map((p) => p.id))
    const rest = bootstrap.players.filter((p) => !seatedIds.has(p.id))
    return [...seated, ...rest]
  })()

  const drawReshuffles = drawDepleted && (session.discard_count ?? 0) > 0

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
            {emptiedHand ? (
              <>
                <Text style={styles.watchTitle}>
                  {finishPosition === 1
                    ? '🏆 You won the round!'
                    : finishPosition
                      ? `🎉 You finished ${ordinal(finishPosition)}`
                      : '🎉 You finished!'}
                </Text>
                <Text style={styles.watchSub}>Waiting for the others to finish — follow along and chat.</Text>
              </>
            ) : (
              <>
                <Text style={styles.watchTitle}>You&apos;re out</Text>
                <Text style={styles.watchSub}>Knocked out — follow the rest of the game and chat.</Text>
              </>
            )}
          </View>
        ) : null}

        <CrazyEightsRoster
          players={orderedPlayers}
          turnPlayerId={turnPlayerId}
          myPlayerId={bootstrap.myPlayerId}
          handCounts={handCounts}
          finishOrder={session.finish_order ?? []}
          eliminatedIds={session.eliminated_player_ids ?? []}
        />

        <CardTableArea
          pileCount={session.draw_count ?? 0}
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
            <Text style={styles.section}>Draw 4 played — accept the draw or challenge?</Text>
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
            <Text style={styles.unoCallText}>Last card!</Text>
          </Pressable>
        ) : null}

        {/* Team-Up: a teammate left mid-round — the remaining partner plays on solo or forfeits. */}
        {!isWatching && session.phase === 'team_leave_decision' && bootstrap.myPlayerId === session.team_decider_id ? (
          <View style={styles.choosePanel}>
            <Text style={styles.section}>🤝 Your teammate left — play on alone or forfeit the round?</Text>
            <View style={styles.colorRow}>
              <Pressable style={styles.actionBtn} disabled={acting} onPress={() => void teamLeaveDecision('continue')}>
                <Text style={styles.actionText}>🙋 Continue solo · 1 v 2</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.challengeBtn]}
                disabled={acting}
                onPress={() => void teamLeaveDecision('forfeit')}
              >
                <Text style={styles.actionText}>🏳️ Forfeit</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Team-Up: your teammate's hand, read-only — plus the quick-chat "hint" trigger. */}
        {partner ? (
          <View style={styles.partnerCard}>
            <View style={styles.partnerHead}>
              <Text style={styles.partnerName}>🤝 {partner.name} (partner)</Text>
              <View style={styles.partnerHeadRight}>
                {!isWatching ? (
                  <Pressable style={styles.quickChatBtn} onPress={() => setQuickPickerOpen((v) => !v)}>
                    <Text style={styles.quickChatBtnText}>💬 Hint</Text>
                  </Pressable>
                ) : null}
                <Text style={styles.partnerCount}>
                  {partner.cards.length} card{partner.cards.length === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
            {quickPickerOpen && !isWatching ? (
              <View style={styles.quickPicker}>
                {UNO_QUICK_MESSAGES.map((msg) => (
                  <Pressable
                    key={msg.id}
                    style={styles.quickChip}
                    onPress={() => {
                      sendQuickMessage(partner.id, me?.name ?? 'Partner', msg.id)
                      setQuickPickerOpen(false)
                    }}
                  >
                    <Text style={styles.quickChipText}>
                      {msg.kind === 'color' ? '🎨' : msg.glyph} {msg.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.partnerCards}>
              {partner.cards.map((card) => (
                <UnoCardFace key={card.id} card={card} compact />
              ))}
            </View>
          </View>
        ) : null}

        {/* Incoming quick message from your partner — a transient bubble, self-dismisses. */}
        {quickChatIncoming
          ? (() => {
              const msg = unoQuickMessage(quickChatIncoming.messageId)
              if (!msg) return null
              return (
                <Pressable key={quickChatIncoming.key} style={styles.quickBubble} onPress={() => dismissQuickMessage()}>
                  <Text style={styles.quickBubbleText}>
                    🤝 {quickChatIncoming.fromName}: {msg.kind === 'color' ? '🎨' : msg.glyph} {msg.label}
                  </Text>
                </Pressable>
              )
            })()
          : null}

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
            <CardHand
              count={myHand?.cards?.length ?? 0}
              many={(myHand?.cards?.length ?? 0) >= 8}
              hint={
                multiMode && multiEnabled ? (
                  <Text style={styles.reshuffleNote}>
                    {selectedCards.length
                      ? `${selectedCards.length} selected — the last card you pick lands on top`
                      : 'Tap matching cards to lay them down together'}
                  </Text>
                ) : canJumpNow ? (
                  <Text style={styles.reshuffleNote}>
                    ⚡ Jump-In! Tap your {top ? cardShortLabel(top) : 'matching'} card to play it out of turn
                  </Text>
                ) : null
              }
            >
              {(myHand?.cards ?? []).map((card) => {
                if (multiMode && multiEnabled) {
                  const selected = selectedIds.includes(card.id)
                  const eligible = selected || canAddToSet(card)
                  return (
                    <Pressable key={card.id} disabled={!eligible || acting} onPress={() => void toggleSelect(card)}>
                      <UnoCardFace card={card} playable={eligible && !selected} sel={selected} dim={!eligible} />
                    </Pressable>
                  )
                }
                const playable = playableIds.has(card.id)
                const jumpable = canJumpIn && isJumpInMatch(card, top)
                const normalDisabled =
                  acting ||
                  !isMyTurn ||
                  !playable ||
                  session.phase !== 'playing' ||
                  (!!session.drawn_card_id && card.id !== session.drawn_card_id)
                // Prefer the normal play path when it's actually your turn; otherwise a Jump-In
                // match plays out of turn instead.
                const useNormalPlay = !normalDisabled
                const disabled = useNormalPlay ? false : jumpable ? acting : true
                // Web parity: any card the player can't act on right now fades — otherwise a
                // full-brightness hand reads as "all playable" when only some are (and none are,
                // when it isn't even your turn).
                const showPlayable = (playable && isMyTurn && !normalDisabled) || jumpable
                const showDim = !showPlayable
                return (
                  <Pressable
                    key={card.id}
                    disabled={disabled}
                    onPress={() => void (useNormalPlay ? playCard(card.id) : jumpIn(card.id))}
                  >
                    <UnoCardFace card={card} playable={showPlayable} dim={showDim} />
                  </Pressable>
                )
              })}
            </CardHand>

            {multiMode && multiEnabled ? (
              <View style={styles.colorRow}>
                <Pressable style={styles.actionBtn} disabled={acting} onPress={exitMultiMode}>
                  <Text style={styles.actionText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, !multiValid && styles.actionBtnDisabled]}
                  disabled={acting || !multiValid}
                  onPress={() => {
                    const ids = selectedIds
                    exitMultiMode()
                    void playMulti(ids)
                  }}
                >
                  <Text style={styles.actionText}>
                    Play {selectedCards.length || ''} card{selectedCards.length === 1 ? '' : 's'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              // Web parity: Draw / Keep / Play multiple sit in a single row beside
              // the hand instead of stacking as full-width buttons.
              (() => {
                const actions: ReactNode[] = []
                if (rouletteDrawing) {
                  // Colour Roulette reveal — one card per tap until the target hits
                  // their chosen colour. Server routes phase='color_roulette' draws
                  // to processUnoColorRouletteReveal.
                  actions.push(
                    <Pressable
                      key="roulette"
                      style={styles.handAction}
                      disabled={acting}
                      onPress={() => void drawCard()}
                    >
                      <Text style={styles.handActionText}>Draw a card</Text>
                    </Pressable>
                  )
                }
                if (canDraw) {
                  actions.push(
                    <Pressable key="draw" style={styles.handAction} disabled={acting} onPress={() => void drawCard()}>
                      <Text style={styles.handActionText}>{drawLabel}</Text>
                    </Pressable>
                  )
                }
                if (canPass) {
                  actions.push(
                    <Pressable key="pass" style={styles.handAction} disabled={acting} onPress={() => void passTurn()}>
                      <Text style={styles.handActionText}>Keep the card</Text>
                    </Pressable>
                  )
                }
                if (multiEnabled) {
                  actions.push(
                    <Pressable key="multi" style={styles.handAction} disabled={acting} onPress={enterMultiMode}>
                      <Text style={styles.handActionText}>➕ Play multiple</Text>
                    </Pressable>
                  )
                }
                if (actions.length === 0) return null
                return <View style={styles.handActionsRow}>{actions}</View>
              })()
            )}
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
    actionBtnDisabled: { opacity: 0.5 },
    partnerCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 8,
    },
    partnerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    partnerName: { color: theme.text, fontSize: 14, fontWeight: '700' },
    partnerHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    partnerCount: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },
    quickChatBtn: {
      backgroundColor: theme.primarySoft,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    quickChatBtnText: { color: theme.text, fontSize: 12, fontWeight: '700' },
    quickPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    quickChip: {
      backgroundColor: theme.surface,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: theme.border,
    },
    quickChipText: { color: theme.text, fontSize: 12, fontWeight: '600' },
    partnerCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    quickBubble: {
      backgroundColor: '#111827',
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: 'center',
    },
    quickBubbleText: { color: '#fff', fontSize: 13, fontWeight: '700' },
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
    handActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    handAction: {
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 120,
      backgroundColor: theme.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    handActionText: { color: theme.text, fontSize: 14, fontWeight: '700' },
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
