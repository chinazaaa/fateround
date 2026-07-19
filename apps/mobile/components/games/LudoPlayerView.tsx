import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { type LudoDiceRoll, type LudoPlayerState, type LudoSession } from '@fateround/shared'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import {
  buildLudoStandings,
  currentPlayerId,
  dedupeLudoMovesForUi,
  parseLudoDice,
  parseLudoVariant,
  resolveLudoMovesForTurn,
  resolveRemainingDice,
  START_POS,
  TRACK_LENGTH,
} from '@fateround/shared/ludo'
import { moveDestinationCell, trackCellsAlongSteps } from '@fateround/shared/ludo-board-layout'
import { LudoBoard } from '@/components/games/ludo/LudoBoard'
import { LudoDicePair, LudoRemainingDice } from '@/components/games/ludo/LudoDice'
import { LudoMoveList } from '@/components/games/ludo/LudoMoveList'
import { LudoTurnBar } from '@/components/games/ludo/LudoTurnBar'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { useGameScores } from '@/components/session/RosterDrawerContext'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useHeaderBadge } from '@/components/session/HeaderBadgeContext'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { postLudoMove, postLudoRoll } from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { LUDO_PLAYER_STATE_SELECT, LUDO_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { ludoLeaderboard } from '@/lib/finish-leaderboards'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'playing'
  | 'finished'
  | 'not_found'

const ROLL_MIN_MS = 700

export function LudoPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const { height: windowHeight } = useWindowDimensions()
  const [session, setSession] = useState<LudoSession | null>(null)
  const [states, setStates] = useState<LudoPlayerState[]>([])
  const [acting, setActing] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [displayDice, setDisplayDice] = useState<LudoDiceRoll | null>(null)

  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    const [sessionRes, statesRes] = await Promise.all([
      getSupabase()
        .from('ludo_sessions')
        .select(LUDO_SESSION_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .maybeSingle(),
      getSupabase()
        .from('ludo_player_state')
        .select(LUDO_PLAYER_STATE_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .order('player_order'),
    ])
    if (sessionRes.error || statesRes.error) return { state: null, ok: false }
    setSession(sessionRes.data as LudoSession | null)
    setStates((statesRes.data as LudoPlayerState[]) ?? [])
    return { state: null, ok: true }
  }, [gameCode])

  const bootstrap = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen: (game, playerId) => {
      if (!playerId) {
        // No session yet. Ludo never seats late joiners as players (viewers-only),
        // so route to the platform pre-join gates: watch as a viewer if the host
        // allows it, otherwise wait for the next lobby / show the ended screen.
        const pre = preJoinScreen(game, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        return 'join'
      }
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'active') return 'playing'
      return 'finished'
    },
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'ludo_sessions', 'ludo_player_state'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'playing',
  })

  const myState = states.find((s) => s.player_id === bootstrap.myPlayerId)
  const me = bootstrap.myPlayerId ? (bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) ?? null) : null
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))
  const variant = parseLudoVariant(bootstrap.game?.ludo_variant)
  // Surface the chosen variant as the header mode pill on every Ludo screen.
  useHeaderBadge(bootstrap.game ? (variant === 'traditional' ? 'Traditional' : 'Modern') : null)
  const remainingDice = session ? resolveRemainingDice(session) : []

  const legalMoves = useMemo(() => {
    if (!session || !myState || !isMyTurn || session.phase !== 'move') return []
    return dedupeLudoMovesForUi(
      resolveLudoMovesForTurn(myState.color, myState.pieces, remainingDice, states, myState.player_id, variant)
    )
  }, [session, myState, isMyTurn, remainingDice, states, variant])

  const highlightCells = useMemo(() => {
    if (!myState || legalMoves.length === 0) return undefined
    const cells = new Set<string>()
    for (const move of legalMoves) {
      const dest = moveDestinationCell(myState.color, move.to)
      if (dest) cells.add(`${Math.round(dest.row)},${Math.round(dest.col)}`)
      // Web parity: highlight the whole trail a track→track move travels, not just
      // the landing cell, so the player can see the path the piece will take.
      if (move.from.zone === 'track' && move.to.zone === 'track') {
        const steps = (move.from.pos - START_POS[myState.color] + TRACK_LENGTH) % TRACK_LENGTH
        for (const cell of trackCellsAlongSteps(myState.color, steps, move.diceValue)) {
          cells.add(`${Math.round(cell.row)},${Math.round(cell.col)}`)
        }
      }
    }
    return cells
  }, [legalMoves, myState])

  // Roster drawer scoreboard: pieces safely home (sorts leader first).
  const rosterScores = useMemo(() => {
    const standings = buildLudoStandings(states, bootstrap.players, session?.winner_player_id ?? null)
    return Object.fromEntries(standings.map((s) => [s.playerId, s.finishedCount]))
  }, [states, bootstrap.players, session?.winner_player_id])
  useGameScores(rosterScores, { suffix: ' 🏠' })

  const roll = async () => {
    if (!bootstrap.myResumeToken || acting || !isMyTurn) return
    setActing(true)
    setRolling(true)
    setDisplayDice(null)
    const rollStart = Date.now()
    try {
      playSound('dice')
      const res = await postLudoRoll(bootstrap.code, bootstrap.myResumeToken)
      if (res?.dice) setDisplayDice(parseLudoDice(res.dice as LudoDiceRoll | number))
      await bootstrap.load()
    } finally {
      const wait = Math.max(0, ROLL_MIN_MS - (Date.now() - rollStart))
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      setRolling(false)
      setActing(false)
    }
  }

  const movePiece = async (pieceId: number, diceIndex: number) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      playSound('move')
      await postLudoMove(bootstrap.code, bootstrap.myResumeToken, pieceId, diceIndex)
      await bootstrap.load()
    } finally {
      setActing(false)
    }
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
    // Mid-game the only way in is as a read-only viewer (Ludo never seats late
    // joiners as players). Present the join form as a "watch" flow so the intent
    // is clear before submitting.
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
    const standings = buildLudoStandings(states, bootstrap.players, session.winner_player_id)
    return (
      <GameShell bootstrap={bootstrap} title={batch3GameLabel('ludo')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={winner ? `${winner.name} wins!` : 'Game over'}
          subtitle="Final standings"
          leaderboard={ludoLeaderboard(standings, bootstrap.myPlayerId)}
          winnerPlayerId={session.winner_player_id}
          roundKey={session.id}
        />
      </GameShell>
    )
  }

  const turnName = bootstrap.players.find((p) => p.id === turnPlayerId)?.name ?? 'Someone'
  // Cap the pinned move list so a long list scrolls within the footer instead of
  // shoving the board off-screen.
  const movesMaxHeight = Math.round(windowHeight * 0.3)

  return (
    <GameShell
      title={batch3GameLabel('ludo')}
      subtitle={isMyTurn ? 'Your turn' : `${turnName}'s turn`}
      gameCode={bootstrap.code}
      game={bootstrap.game}
      players={bootstrap.players}
      myPlayerId={bootstrap.myPlayerId}
      onPromoted={() => bootstrap.load()}
    >
      {/* Turn/timer bar pinned to the top — always visible without scrolling. */}
      <LudoTurnBar
        gameCode={bootstrap.code}
        session={session}
        turnPlayerName={turnName}
        isMyTurn={isMyTurn}
        active={bootstrap.game.status === 'active'}
        isViewer={isViewer}
      />

      {/* Only the (tall) board scrolls. */}
      <ScrollView style={styles.boardScroll} contentContainerStyle={styles.boardScrollContent}>
        <LudoBoard
          states={states}
          players={bootstrap.players}
          legalMoves={legalMoves}
          myPlayerId={bootstrap.myPlayerId}
          isMyTurn={isMyTurn && session.phase === 'move'}
          highlightCells={highlightCells}
          onMovePiece={(pieceId, diceIndex) => void movePiece(pieceId, diceIndex)}
          acting={acting}
          variant={variant}
          turnPlayerId={turnPlayerId}
        />
        {session.status_message ? <Text style={styles.status}>{session.status_message}</Text> : null}
      </ScrollView>

      {/* Dice + roll / move controls pinned to the bottom — reachable every turn. */}
      <View style={styles.footer}>
        <View style={styles.diceCard}>
          {session.phase === 'move' && remainingDice.length > 0 ? (
            <LudoRemainingDice remaining={remainingDice} />
          ) : (
            <LudoDicePair dice={rolling ? null : (displayDice ?? parseLudoDice(session.last_dice))} rolling={rolling} />
          )}
          {session.consecutive_sixes > 0 ? (
            <Text style={styles.bonus}>Bonus: {session.consecutive_sixes}/3</Text>
          ) : null}
        </View>

        {isMyTurn && session.phase === 'roll' ? (
          <>
            <Pressable style={[styles.btn, acting && styles.btnDisabled]} disabled={acting} onPress={() => void roll()}>
              <Text style={styles.btnText}>{acting ? 'Rolling…' : '🎲 Roll dice'}</Text>
            </Pressable>
            {!rolling ? (
              <Text style={styles.rollHint}>Roll a 6 on either die to leave your yard onto your ★ start square.</Text>
            ) : null}
          </>
        ) : null}

        {isMyTurn && session.phase === 'move' && legalMoves.length > 0 ? (
          <ScrollView style={{ maxHeight: movesMaxHeight }} showsVerticalScrollIndicator={false}>
            <LudoMoveList
              moves={legalMoves}
              myColor={myState?.color}
              remainingDice={remainingDice}
              acting={acting}
              onMovePiece={(pieceId, diceIndex) => void movePiece(pieceId, diceIndex)}
            />
          </ScrollView>
        ) : null}

        {isMyTurn && session.phase === 'move' && legalMoves.length === 0 ? (
          <Text style={styles.noMoves}>No legal moves for this roll — wait for the turn to pass.</Text>
        ) : null}

        {!isMyTurn ? (
          <Text style={styles.hint}>{isViewer ? `Spectating — ${turnName}'s turn` : `Waiting for ${turnName}…`}</Text>
        ) : null}
      </View>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    boardScroll: { flex: 1 },
    boardScrollContent: { gap: 12, paddingVertical: 8, alignItems: 'center' },
    footer: {
      gap: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.surfaceHover,
    },
    status: { color: theme.textMuted, textAlign: 'center' },
    diceCard: {
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingVertical: 12,
    },
    bonus: { color: '#fcd34d', fontWeight: '800', fontSize: 12, fontVariant: ['tabular-nums'] },
    btn: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    btnDisabled: { opacity: 0.45 },
    // White on the solid primary button — intentional (case 2).
    btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    noMoves: { color: '#fcd34d', textAlign: 'center', fontWeight: '600', fontSize: 13 },
    rollHint: { color: theme.textMuted, textAlign: 'center', fontSize: 12 },
    hint: { color: theme.textMuted, textAlign: 'center' },
  })
