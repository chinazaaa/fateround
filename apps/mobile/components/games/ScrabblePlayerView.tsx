import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native'
import type { Game, Player, ScrabblePlacedTile, ScrabblePlayerState, ScrabbleSession } from '@fateround/shared'
import { batch6GameLabel } from '@fateround/shared/batch-6-games'
import { SCRABBLE_BOARD_SIZE, SCRABBLE_CENTER, scrabblePremiumAt } from '@fateround/shared/scrabble-constants'
import { currentTurnPlayerId, scorePlacement, withPlacedTiles } from '@fateround/shared/scrabble-board'
import { tileSetForDictionary } from '@fateround/shared/scrabble-rulesets'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import { JoinScreen } from '@/components/JoinScreen'
import { GameInfoChips } from '@/components/GameInfoChips'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { useGameScores, useGameStats } from '@/components/session/RosterDrawerContext'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { ScrabbleTile } from '@/components/games/scrabble/ScrabbleTile'
import { ScrabbleGameTimerBar } from '@/components/games/scrabble/ScrabbleGameTimerBar'
import { ScrabbleShareCard, type ScrabbleShareStanding } from '@/components/games/scrabble/ScrabbleShareCard'
import { ScrabbleLiveScoreboard, ScrabbleTurnBadge } from '@/components/games/scrabble/ScrabbleClocks'
import { useStickyTimer } from '@/components/session/StickyTimerContext'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postScrabbleExchange, postScrabbleExpireTurn, postScrabblePass, postScrabblePlay } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { SCRABBLE_PLAYER_STATE_SELECT, SCRABBLE_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { scoreListLeaderboard } from '@/lib/finish-leaderboards'
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

type PendingTile = ScrabblePlacedTile & { rackIndex: number }

// LayoutAnimation needs an explicit opt-in on Android; enables the smooth rack
// reflow when tiles are shuffled or manually reordered.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

const animateRack = () =>
  LayoutAnimation.configureNext(
    LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
  )

export function ScrabblePlayerView({ gameCode }: { gameCode: string }) {
  const [session, setSession] = useState<ScrabbleSession | null>(null)
  const [playerStates, setPlayerStates] = useState<ScrabblePlayerState[]>([])
  const [pending, setPending] = useState<PendingTile[]>([])
  const [selectedRackIndex, setSelectedRackIndex] = useState<number | null>(null)
  const [exchangeMode, setExchangeMode] = useState(false)
  const [exchangeIndices, setExchangeIndices] = useState<number[]>([])
  const [acting, setActing] = useState(false)
  const [blankPicker, setBlankPicker] = useState<{ row: number; col: number; rackIndex: number } | null>(null)
  // Cosmetic rack ordering (shuffle aid). Holds rack indices in display order; null =
  // natural order. Mirrors web ScrabbleBoard rackOrder / 🔀 Shuffle.
  const [rackOrder, setRackOrder] = useState<number[] | null>(null)
  // Manual rack reorder: tap-to-swap (no drag library available). Holds the
  // display slot picked as the first half of a swap; the next tap completes it.
  const [reorderMode, setReorderMode] = useState(false)
  const [reorderPick, setReorderPick] = useState<number | null>(null)
  const styles = useThemedStyles(makeStyles)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: ScrabbleSession | null; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [sessionRes, statesRes] = await Promise.all([
        getSupabase().from('scrabble_sessions').select(SCRABBLE_SESSION_SELECT).eq('game_id', code).maybeSingle(),
        getSupabase()
          .from('scrabble_player_state')
          .select(SCRABBLE_PLAYER_STATE_SELECT)
          .eq('game_id', code)
          .order('player_order'),
      ])
      if (sessionRes.error || statesRes.error) return { state: null, ok: false }
      const sessionData = sessionRes.data as ScrabbleSession | null
      setSession(sessionData)
      setPlayerStates((statesRes.data as ScrabblePlayerState[]) ?? [])
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

  const bootstrap = useGameViewBootstrap<Screen, ScrabbleSession | null>({
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
    [{ table: 'games', column: 'id' }, 'scrabble_sessions', 'scrabble_player_state'],
    () => bootstrap.load(),
    !!bootstrap.game,
    bootstrap.game?.status
  )

  const activeSession = session ?? bootstrap.gameState
  const myState = playerStates.find((s) => s.player_id === bootstrap.myPlayerId)
  const me = bootstrap.myPlayerId ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) : undefined
  // Late joiners are seated as read-only viewers (spectators). Disables all turn actions.
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))
  const turnPlayerId = activeSession ? currentTurnPlayerId(activeSession) : null
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId && !myState?.timed_out && !isViewer

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'playing',
  })

  const tileSet = tileSetForDictionary(bootstrap.game?.scrabble_dictionary_id)

  const usedRackIndices = useMemo(() => new Set(pending.map((t) => t.rackIndex)), [pending])

  const previewBoard = useMemo(() => {
    if (!activeSession) return null
    return withPlacedTiles(activeSession.board, pending)
  }, [activeSession, pending])

  const placementPreview = useMemo(() => {
    if (!activeSession || pending.length === 0) return null
    return scorePlacement(activeSession.board, pending, tileSet.values)
  }, [activeSession, pending, tileSet.values])

  const { width } = useWindowDimensions()
  const cellSize = Math.min(Math.floor((width - 32) / SCRABBLE_BOARD_SIZE), 24)
  // Both live clocks (chess tick + standard deadline) live inside ScrabbleTurnBadge /
  // ScrabbleLiveScoreboard leaves so this board/rack parent doesn't re-render 4× a
  // second (M1). Only the mode flag is needed up here.
  const isChess = activeSession?.clock_mode === 'chess'

  useEffect(() => {
    if (!activeSession || activeSession.phase !== 'playing') return
    if (activeSession.clock_mode !== 'standard' || !activeSession.turn_deadline_at) return
    const deadline = Date.parse(activeSession.turn_deadline_at)
    if (Number.isNaN(deadline) || Date.now() < deadline) return
    void postScrabbleExpireTurn(bootstrap.code)
      .then(() => bootstrap.load())
      .catch(() => {})
  }, [activeSession?.turn_deadline_at, activeSession?.phase, activeSession?.clock_mode, bootstrap.code, bootstrap.load])

  const rackLength = myState?.rack.length ?? 0
  // Ordered rack indices for display. Falls back to natural order and self-heals if the
  // rack size changes (after a play/exchange the shuffled order is dropped).
  const orderedRackIndices = useMemo(() => {
    const natural = Array.from({ length: rackLength }, (_, i) => i)
    if (!rackOrder || rackOrder.length !== rackLength) return natural
    const seen = new Set(rackOrder)
    if (seen.size !== rackLength || rackOrder.some((i) => i < 0 || i >= rackLength)) return natural
    return rackOrder
  }, [rackOrder, rackLength])

  // Roster drawer scoreboard: score headline + tiles-on-rack detail.
  const rosterScores = useMemo(
    () => Object.fromEntries(playerStates.map((s) => [s.player_id, s.score])),
    [playerStates]
  )
  useGameScores(rosterScores, { suffix: ' pts' })
  const rosterDetails = useMemo(
    () =>
      Object.fromEntries(
        playerStates.map((s) => [s.player_id, `🔤 ${s.rack.length} tile${s.rack.length === 1 ? '' : 's'}`])
      ),
    [playerStates]
  )
  useGameStats(rosterDetails)

  const shuffleRack = () => {
    if (rackLength < 2) return
    const idx = Array.from({ length: rackLength }, (_, i) => i)
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]!]
    }
    animateRack()
    setRackOrder(idx)
    setReorderPick(null)
  }

  // Tap-to-swap manual reorder (pragmatic stand-in for drag-to-reorder — no
  // drag/gesture library is available). Operates on display slots so the rack
  // reflows through the natural-order fallback correctly.
  const swapRackSlots = (a: number, b: number) => {
    if (a === b) return
    const order = orderedRackIndices.slice()
    const tmp = order[a]!
    order[a] = order[b]!
    order[b] = tmp
    animateRack()
    setRackOrder(order)
  }

  const toggleReorderMode = () => {
    setReorderMode((prev) => !prev)
    setReorderPick(null)
    setSelectedRackIndex(null)
  }

  const handleRackTilePress = (slot: number, index: number, letter: string) => {
    if (reorderMode) {
      if (reorderPick == null) {
        setReorderPick(slot)
      } else if (reorderPick === slot) {
        setReorderPick(null)
      } else {
        swapRackSlots(reorderPick, slot)
        setReorderPick(null)
      }
      return
    }
    onRackPress(index, letter)
  }

  const lastMove = activeSession?.last_move ?? null
  const lastMoveName = lastMove ? (bootstrap.players.find((p) => p.id === lastMove.player_id)?.name ?? 'Player') : null
  const lastMoveText =
    lastMove && lastMoveName
      ? lastMove.kind === 'play'
        ? `${lastMoveName} played ${lastMove.words.join(', ')} for ${lastMove.score} pts`
        : lastMove.kind === 'exchange'
          ? `${lastMoveName} exchanged tiles`
          : `${lastMoveName} passed`
      : null

  const resetTurnUi = () => {
    setPending([])
    setSelectedRackIndex(null)
    setExchangeMode(false)
    setExchangeIndices([])
    setBlankPicker(null)
    setReorderMode(false)
    setReorderPick(null)
  }

  const act = async (fn: () => Promise<unknown>) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await fn()
      resetTurnUi()
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  const placeAt = (row: number, col: number, letter: string, isBlank: boolean, rackIndex: number) => {
    setPending((prev) => [
      ...prev.filter((t) => !(t.row === row && t.col === col)),
      { row, col, letter, isBlank, rackIndex },
    ])
    setSelectedRackIndex(null)
    setBlankPicker(null)
  }

  const onCellPress = (row: number, col: number) => {
    if (!activeSession || !isMyTurn || acting || exchangeMode) return
    const existingPending = pending.find((t) => t.row === row && t.col === col)
    if (existingPending) {
      setPending((prev) => prev.filter((t) => !(t.row === row && t.col === col)))
      return
    }
    if (activeSession.board[row][col]) return
    if (selectedRackIndex == null || !myState) return
    const rackLetter = myState.rack[selectedRackIndex]
    if (!rackLetter) return
    if (rackLetter === '?') {
      setBlankPicker({ row, col, rackIndex: selectedRackIndex })
      return
    }
    placeAt(row, col, rackLetter, false, selectedRackIndex)
  }

  const onRackPress = (index: number, letter: string) => {
    if (!isMyTurn || acting) return
    if (exchangeMode) {
      setExchangeIndices((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]))
      return
    }
    if (usedRackIndices.has(index)) return
    setSelectedRackIndex((prev) => (prev === index ? null : index))
  }

  const submitPlay = () => act(() => postScrabblePlay(bootstrap.code, bootstrap.myResumeToken!, pending))
  const submitPass = () => act(() => postScrabblePass(bootstrap.code, bootstrap.myResumeToken!))
  const submitExchange = () =>
    act(() => postScrabbleExchange(bootstrap.code, bootstrap.myResumeToken!, exchangeIndices))

  const gameTimer =
    (bootstrap.game?.game_duration_seconds ?? 0) > 0 &&
    bootstrap.game?.status === 'active' &&
    bootstrap.game?.scrabble_clock_mode !== 'chess' ? (
      <ScrabbleGameTimerBar gameCode={bootstrap.code} game={bootstrap.game} onExpired={() => void bootstrap.load()} />
    ) : null
  const gameTimerPinned = useStickyTimer(gameTimer, [bootstrap.code, bootstrap.game])

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
        lobbyFull={bootstrap.lobbyFull}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
        kicker={joiningAsViewer ? 'Watch game' : 'Join game'}
        hint={
          joiningAsViewer
            ? 'Game in progress — enter a name to watch as a viewer (read-only).'
            : 'No account needed — enter a display name and play.'
        }
        submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
        footer={<GameRulesLink gameType={bootstrap.game.game_type} />}
        infoChips={<GameInfoChips game={bootstrap.game} />}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game || !activeSession || !previewBoard) return <GameLoading />

  if (bootstrap.screen === 'finished' || activeSession.phase === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === activeSession.winner_player_id)
    const isTie = activeSession.is_tie === true
    const endedEarly = !winner && !isTie
    const title = isTie ? 'Tie game!' : winner ? `${winner.name} wins!` : 'Game over'
    const sorted = playerStates.slice().sort((a, b) => b.score - a.score)
    const shareStandings: ScrabbleShareStanding[] = sorted.map((s, i) => ({
      playerId: s.player_id,
      name: bootstrap.players.find((p) => p.id === s.player_id)?.name ?? 'Player',
      score: s.score,
      rank: i + 1,
    }))
    const scores = shareStandings.map((s) => `${s.name}: ${s.score}`).join(' · ')
    return (
      <GameShell bootstrap={bootstrap} title={batch6GameLabel('scrabble')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={title}
          subtitle="Final standings"
          detail={scores || activeSession.status_message || undefined}
          winnerPlayerId={activeSession.winner_player_id}
          roundKey={activeSession.id}
          notice={
            <ScrabbleShareCard
              standings={shareStandings}
              winnerName={winner?.name ?? null}
              isTie={isTie}
              endedEarly={endedEarly}
              highlightPlayerId={bootstrap.myPlayerId}
              hideHeader
            />
          }
        />
      </GameShell>
    )
  }

  const turnPlayer = bootstrap.players.find((p) => p.id === turnPlayerId)
  const tilesInBag = activeSession.bag?.length ?? 0
  const canExchange = tilesInBag >= 7

  return (
    <GameShell bootstrap={bootstrap} title="Word Tiles" subtitle={`Code ${bootstrap.code}`}>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TurnBanner
          text={
            isViewer
              ? `Spectating — ${turnPlayer?.name ?? 'Player'}'s turn`
              : exchangeMode
                ? `Exchange mode — pick tiles (${exchangeIndices.length})`
                : pending.length > 0
                  ? placementPreview?.valid
                    ? `Preview +${placementPreview.score} (${placementPreview.words.join(', ')})`
                    : (placementPreview?.error ?? 'Place tiles on the board')
                  : isMyTurn
                    ? 'Your turn — pick a rack tile, then tap a square'
                    : `${turnPlayer?.name ?? 'Player'}'s turn`
          }
          isMyTurn={isMyTurn}
        />

        {gameTimerPinned ? null : gameTimer}

        <ScrabbleTurnBadge
          session={activeSession}
          playerStates={playerStates}
          onChessExpire={() =>
            void postScrabbleExpireTurn(bootstrap.code)
              .then(() => bootstrap.load())
              .catch(() => {})
          }
        />

        {isChess && myState?.timed_out ? (
          <Text style={styles.timedOutBanner}>
            ⏳ You&apos;re out of time — spectating. The game ends when every clock runs out.
          </Text>
        ) : null}

        <Text style={styles.bagCount}>{tilesInBag} tiles left in bag</Text>

        {lastMoveText ? <Text style={styles.lastMove}>{lastMoveText}</Text> : null}

        <ScrabbleLiveScoreboard
          session={activeSession}
          playerStates={playerStates}
          players={bootstrap.players}
          myPlayerId={bootstrap.myPlayerId}
          turnPlayerId={turnPlayerId}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.board}>
            {Array.from({ length: SCRABBLE_BOARD_SIZE }, (_, row) => (
              <View key={row} style={styles.boardRow}>
                {Array.from({ length: SCRABBLE_BOARD_SIZE }, (_, col) => {
                  const prem = scrabblePremiumAt(row, col)
                  const cell = previewBoard[row][col]
                  const isPending = pending.some((t) => t.row === row && t.col === col)
                  const isLast = activeSession.last_move?.tiles.some((t) => t.row === row && t.col === col)
                  const letter = cell?.letter ?? null
                  const points =
                    letter && letter !== '?'
                      ? (tileSet.values[letter.toUpperCase()] ?? tileSet.values[letter] ?? undefined)
                      : undefined
                  return (
                    <Pressable
                      key={col}
                      style={[
                        styles.cell,
                        { width: cellSize, height: cellSize },
                        prem === 'TW' && styles.tw,
                        prem === 'DW' && styles.dw,
                        prem === 'TL' && styles.tl,
                        prem === 'DL' && styles.dl,
                        isLast && styles.lastCell,
                      ]}
                      disabled={!isMyTurn || acting}
                      onPress={() => onCellPress(row, col)}
                    >
                      {!cell && prem ? <Text style={styles.premLabel}>{prem}</Text> : null}
                      {!cell && !prem && row === SCRABBLE_CENTER.row && col === SCRABBLE_CENTER.col ? (
                        <Text style={styles.centerStar}>★</Text>
                      ) : null}
                      {letter ? (
                        <ScrabbleTile
                          letter={letter}
                          points={points}
                          size={Math.max(cellSize - 2, 14)}
                          pending={isPending}
                          onBoard
                        />
                      ) : null}
                    </Pressable>
                  )
                })}
              </View>
            ))}
          </View>
        </ScrollView>

        {myState && rackLength > 0 && !isViewer ? (
          <>
            <View style={styles.rackHeader}>
              <Text style={styles.rackHeaderText}>{reorderMode ? 'Tap two tiles to swap' : 'Your rack'}</Text>
              {rackLength >= 2 && !exchangeMode ? (
                <View style={styles.rackHeaderActions}>
                  <Pressable
                    style={[styles.shuffleBtn, reorderMode && styles.shuffleBtnActive]}
                    hitSlop={8}
                    onPress={toggleReorderMode}
                  >
                    <Text style={[styles.shuffleText, reorderMode && styles.shuffleTextActive]}>
                      {reorderMode ? '✓ Done' : '↔ Reorder'}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.shuffleBtn} hitSlop={8} onPress={shuffleRack}>
                    <Text style={styles.shuffleText}>🔀 Shuffle</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            <View style={styles.rack}>
              {orderedRackIndices.map((index, slot) => {
                const letter = myState.rack[index]
                if (letter == null) return null
                const used = usedRackIndices.has(index)
                const selected = reorderMode ? reorderPick === slot : selectedRackIndex === index
                const exchanging = exchangeIndices.includes(index)
                const points = letter !== '?' ? (tileSet.values[letter] ?? undefined) : undefined
                // Reorder mode is always tappable (cosmetic); play/exchange taps
                // stay gated on the active turn.
                const disabled = reorderMode ? false : !isMyTurn || acting || (used && !exchangeMode)
                return (
                  <Pressable key={index} disabled={disabled} onPress={() => handleRackTilePress(slot, index, letter)}>
                    <ScrabbleTile letter={letter} points={points} size={40} selected={selected} pending={exchanging} />
                  </Pressable>
                )
              })}
            </View>
          </>
        ) : null}

        {isMyTurn ? (
          <View style={styles.actions}>
            {!exchangeMode ? (
              <>
                <ActionBtn label="Recall" disabled={acting || pending.length === 0} onPress={() => setPending([])} />
                <ActionBtn
                  label={`Play${placementPreview?.valid ? ` +${placementPreview.score}` : ''}`}
                  primary
                  disabled={acting || !placementPreview?.valid}
                  onPress={() => void submitPlay()}
                />
                <ActionBtn label="Pass" disabled={acting} onPress={() => void submitPass()} />
                <ActionBtn
                  label="Exchange"
                  disabled={acting || !canExchange}
                  onPress={() => {
                    setExchangeMode(true)
                    setPending([])
                    setSelectedRackIndex(null)
                  }}
                />
              </>
            ) : (
              <>
                <ActionBtn label="Cancel" disabled={acting} onPress={() => setExchangeMode(false)} />
                <ActionBtn
                  label="Confirm exchange"
                  primary
                  disabled={acting || exchangeIndices.length === 0}
                  onPress={() => void submitExchange()}
                />
              </>
            )}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={!!blankPicker} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Text style={styles.modalTitle}>Blank tile — choose letter</Text>
            <View style={styles.letterGrid}>
              {tileSet.alphabet.map((letter) => (
                <Pressable
                  key={letter}
                  style={styles.letterBtn}
                  onPress={() =>
                    blankPicker && placeAt(blankPicker.row, blankPicker.col, letter, true, blankPicker.rackIndex)
                  }
                >
                  <Text style={styles.letterBtnText}>{letter}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.promoCancel} onPress={() => setBlankPicker(null)}>
              <Text style={styles.promoCancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </GameShell>
  )
}

function ActionBtn({
  label,
  onPress,
  disabled,
  primary,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  primary?: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <Pressable
      style={[styles.actionBtn, primary && styles.actionPrimary, disabled && styles.actionDisabled]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // The whole game surface scrolls vertically so the board, rack, and action
    // buttons are all reachable on short screens (GameShell itself doesn't scroll).
    pageScroll: { flex: 1, marginHorizontal: -16 },
    pageScrollContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
    timedOutBanner: {
      color: theme.textMuted,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '600',
    },
    bagCount: {
      color: theme.textMuted,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
    },
    lastMove: {
      color: theme.textFaint,
      textAlign: 'center',
      fontSize: 12,
      marginTop: 2,
    },
    rackHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    rackHeaderText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    rackHeaderActions: { flexDirection: 'row', gap: 8 },
    shuffleBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    shuffleBtnActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    shuffleText: { color: theme.text, fontSize: 12, fontWeight: '700' },
    shuffleTextActive: { color: theme.primaryMuted },
    board: { alignSelf: 'center', borderWidth: 2, borderColor: theme.border, marginVertical: 8 },
    boardRow: { flexDirection: 'row' },
    // Neutral warm-grey empty square + rose/violet FateRound-branded premium colours
    // (word bonuses in violet, letter bonuses in rose) — distinct from the commercial
    // tan-board + red/pink/blue premium palette.
    cell: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#e7e5e4',
      borderWidth: 0.5,
      borderColor: '#a8a29e',
    },
    tw: { backgroundColor: '#6d28d9' },
    dw: { backgroundColor: '#a78bfa' },
    tl: { backgroundColor: '#e11d48' },
    dl: { backgroundColor: '#fda4af' },
    lastCell: { backgroundColor: '#fde68a' },
    premLabel: { fontSize: 7, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },
    // Mirror web (ScrabbleBoard.tsx:191): a rose star marks the compulsory first-word cell.
    centerStar: { fontSize: 12, color: '#fb7185', lineHeight: 12 },
    rack: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginVertical: 8 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    actionBtn: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: theme.border,
    },
    actionPrimary: { backgroundColor: theme.primary },
    actionDisabled: { opacity: 0.45 },
    actionText: { color: theme.text, fontWeight: '700', fontSize: 13 },
    // white on the solid rose primary button — intentional
    actionTextPrimary: { color: '#fff' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
    modalScroll: { backgroundColor: theme.surface, borderRadius: 12, padding: 16 },
    modalTitle: { color: theme.text, fontSize: 18, fontWeight: '800', marginBottom: 12 },
    letterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    letterBtn: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    letterBtnText: { color: theme.text, fontWeight: '800', fontSize: 16, alignSelf: 'stretch', textAlign: 'center' },
    promoCancel: { padding: 12, marginTop: 8 },
    promoCancelText: { color: theme.textMuted, textAlign: 'center' },
  })
