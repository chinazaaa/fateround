import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type Game, type Player } from '@fateround/shared'
import { batch8GameLabel } from '@fateround/shared/batch-8-games'
import {
  currentMahjongPlayerId,
  mahjongPhaseLabel,
  mahjongSecondsLeft,
  playerName,
  sortMahjongTiles,
  stateFor,
  type MahjongStateResponse,
} from '@fateround/shared/mahjong'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { MahjongTableView } from '@/components/games/mahjong/MahjongTableView'
import { MahjongShareCard } from '@/components/games/mahjong/MahjongShareCard'
import { MahjongTileFace } from '@/components/games/mahjong/MahjongTileFace'
import { DraggableHandTile, type PondRect } from '@/components/games/mahjong/DraggableHandTile'
import {
  canDeclareMahjongForRuleset,
  canRonWithDiscard,
  isMahjongTenpai,
  mahjongSelfKongOptions,
  type MahjongSelfKongOption,
} from '@/components/games/mahjong/mahjong-self-actions'
import { playerIsViewer } from '@fateround/shared/viewers'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { getPlayerSession } from '@/lib/secure-session'
import {
  getMahjongState,
  postMahjongClaim,
  postMahjongDiscard,
  postMahjongExpireTurn,
  postMahjongPass,
  postMahjongRiichi,
} from '@/lib/game-api'
import { useTurnExpiryTimer } from '@/hooks/useTurnExpiryTimer'
import { usePlayerSessionActions } from '@/lib/player-session'
import { mahjongLeaderboard } from '@/lib/finish-leaderboards'
import { mahjongMeldClaims, isSeatAfterDiscarder, type MeldClaim } from '@/lib/mahjong-claims'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function MahjongPlayerView({ gameCode }: { gameCode: string }) {
  const [mahjongState, setMahjongState] = useState<MahjongStateResponse | null>(null)
  const [acting, setActing] = useState(false)
  const [timerTick, setTimerTick] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [dragOverPond, setDragOverPond] = useState(false)
  const pondRef = useRef<View | null>(null)
  const pondRectRef = useRef<PondRect | null>(null)
  const styles = useThemedStyles(makeStyles)

  const measurePond = useCallback(() => {
    const node = pondRef.current
    if (!node) return
    node.measureInWindow((x, y, width, height) => {
      pondRectRef.current = { x, y, width, height }
    })
  }, [])

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: MahjongStateResponse | null; ok: boolean }> => {
      try {
        const session = await getPlayerSession(gameCode.toUpperCase())
        if (!session?.playerId) return { state: null, ok: true }
        const data = await getMahjongState(gameCode.toUpperCase(), session.playerId, session.resumeToken)
        setMahjongState(data)
        return { state: data, ok: true }
      } catch {
        return { state: null, ok: false }
      }
    },
    [gameCode]
  )

  const bootstrap = useGameViewBootstrap<Screen, MahjongStateResponse | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen: (game, playerId, stateData) => {
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'finished' || stateData?.session?.phase === 'finished') return 'finished'
      if (game.status === 'active') return 'playing'
      return 'waiting'
    },
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'mahjong_sessions', 'mahjong_player_state'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  useEffect(() => {
    const id = setInterval(() => setTimerTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const session = mahjongState?.session ?? null
  const states = mahjongState?.states ?? []
  const myState = bootstrap.myPlayerId ? stateFor(states, bootstrap.myPlayerId) : null
  const turnPlayerId = session ? currentMahjongPlayerId(session) : null
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'playing',
  })

  const sortedHand = myState ? sortMahjongTiles(myState.hand ?? []) : []
  void timerTick
  const secondsLeft = mahjongSecondsLeft(session?.turn_deadline_at)

  // Advance a stalled turn when the per-turn timer runs out (current player, plus
  // any seat during the claim window — matches web). Server is idempotent.
  useTurnExpiryTimer({
    deadlineAt: session?.turn_deadline_at,
    enabled: bootstrap.screen === 'playing' && (isMyTurn || session?.phase === 'claim'),
    onExpire: () => postMahjongExpireTurn(bootstrap.code).then(() => bootstrap.load()),
  })

  const act = async (fn: () => Promise<unknown>) => {
    if (!bootstrap.myPlayerId || !bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await fn()
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  const discard = (tile: string) =>
    void act(() =>
      postMahjongDiscard(gameCode.toUpperCase(), bootstrap.myPlayerId!, bootstrap.myResumeToken!, tile)
    )

  const passClaim = () =>
    void act(() => postMahjongPass(gameCode.toUpperCase(), bootstrap.myPlayerId!, bootstrap.myResumeToken!))

  const claimMahjong = () =>
    void act(() =>
      postMahjongClaim(gameCode.toUpperCase(), bootstrap.myPlayerId!, bootstrap.myResumeToken!, 'mahjong')
    )

  const claimMeld = (meld: MeldClaim) =>
    void act(() =>
      postMahjongClaim(
        gameCode.toUpperCase(),
        bootstrap.myPlayerId!,
        bootstrap.myResumeToken!,
        meld.type,
        meld.tiles
      )
    )

  const declareSelfKong = (option: MahjongSelfKongOption) =>
    void act(() =>
      postMahjongClaim(
        gameCode.toUpperCase(),
        bootstrap.myPlayerId!,
        bootstrap.myResumeToken!,
        'kong',
        [option.tile]
      )
    )

  const declareRiichi = () =>
    void act(() =>
      postMahjongRiichi(gameCode.toUpperCase(), bootstrap.myPlayerId!, bootstrap.myResumeToken!)
    )

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
        onJoin={() =>
          void bootstrap.join(
            undefined,
            bootstrap.game?.status === 'active' ? { joinAsViewer: true } : undefined
          )
        }
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (bootstrap.screen === 'finished' && bootstrap.game) {
    const winnerIds =
      session?.winner_player_ids && session.winner_player_ids.length > 0
        ? session.winner_player_ids
        : session?.winner_player_id
          ? [session.winner_player_id]
          : []
    const winnerNames = winnerIds
      .map((id) => bootstrap.players.find((p) => p.id === id)?.name)
      .filter((n): n is string => !!n)
    const title =
      winnerNames.length > 0
        ? `${winnerNames.join(' & ')} calls Mahjong!`
        : session?.status_message ?? 'Wall draw'
    return (
      <GameFinishPanel
        bootstrap={bootstrap}
        title={title}
        subtitle="Final standings"
        leaderboard={mahjongLeaderboard(
          bootstrap.players,
          session?.scores,
          session?.score_summary?.payments,
          winnerIds,
          bootstrap.myPlayerId
        )}
        winnerPlayerId={winnerIds[0] ?? null}
        roundKey={session?.id}
        hideDefaultHeader
        notice={
          <MahjongShareCard
            gameTitle={bootstrap.game.title}
            winnerName={winnerNames[0] ?? null}
            isDraw={winnerIds.length === 0}
            session={session}
            players={bootstrap.players}
            highlightPlayerId={bootstrap.myPlayerId}
          />
        }
      />
    )
  }
  if (!bootstrap.game || !session) return <GameLoading />

  const me = bootstrap.myPlayerId ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) : null
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))

  const turnName = playerName(bootstrap.players, turnPlayerId)
  const canDiscard = !isViewer && isMyTurn && session.phase === 'discard' && sortedHand.length > 0
  const canSelfWin =
    !isViewer &&
    isMyTurn &&
    session.phase === 'discard' &&
    !!myState &&
    canDeclareMahjongForRuleset(myState.hand, myState.melds, session.ruleset)
  const selfKongOptions: MahjongSelfKongOption[] =
    !isViewer && isMyTurn && session.phase === 'discard' ? mahjongSelfKongOptions(myState) : []
  // Riichi is only valid in the riichi ruleset, from a closed (all-concealed)
  // tenpai hand — mirrors web `canRiichi`.
  const canRiichi =
    !isViewer &&
    isMyTurn &&
    session.phase === 'discard' &&
    session.ruleset === 'riichi' &&
    !!myState &&
    !myState.riichi_declared &&
    myState.melds.every((meld) => !meld.from_player_id || meld.concealed) &&
    isMahjongTenpai(myState.hand ?? [], myState.melds ?? [])
  const inClaimWindow = session.phase === 'claim' && session.last_discard != null
  const alreadyPassed = bootstrap.myPlayerId ? session.claim_passes.includes(bootstrap.myPlayerId) : false
  const canClaim = !isViewer && inClaimWindow && !alreadyPassed && !isMyTurn
  const meldClaims: MeldClaim[] =
    canClaim && session.last_discard
      ? mahjongMeldClaims(
          myState?.hand ?? [],
          session.last_discard.tile,
          isSeatAfterDiscarder(session.turn_order, session.last_discard.player_id, bootstrap.myPlayerId)
        )
      : []
  // Only offer the Mahjong (ron) claim when the discard actually completes the
  // hand under the ruleset — mirrors web `mahjongClaimOptionsForPlayer`.
  const canRon =
    canClaim && !!session.last_discard && !!myState
      ? canRonWithDiscard(myState.hand ?? [], myState.melds ?? [], session.last_discard.tile, session.ruleset)
      : false
  const hasClaimOptions = canRon || meldClaims.length > 0

  return (
    <GameShell bootstrap={bootstrap} title={batch8GameLabel('mahjong')} subtitle={mahjongPhaseLabel(session.phase)}>
      <ScrollView contentContainerStyle={styles.content}>
        <TurnBanner
          isMyTurn={isMyTurn || canClaim}
          text={
            secondsLeft > 0
              ? `${isMyTurn ? 'Your turn' : `${turnName}'s turn`} · ${secondsLeft}s`
              : isMyTurn
                ? 'Your turn'
                : `${turnName}'s turn`
          }
        />

        {session.status_message ? <Text style={styles.status}>{session.status_message}</Text> : null}

        {secondsLeft > 0 ? <TimerBadge seconds={secondsLeft} /> : null}

        <MahjongTableView
          session={session}
          states={states}
          players={bootstrap.players}
          turnPlayerId={turnPlayerId}
          myPlayerId={bootstrap.myPlayerId}
          canDiscard={canDiscard && !acting}
          dragActive={dragActive}
          dragOverPond={dragOverPond}
          pondRef={pondRef}
        />

        {isViewer ? (
          <Text style={styles.viewerNote}>Viewer mode hides private hands.</Text>
        ) : (
          <>
            <Text style={styles.section}>Your hand ({sortedHand.length})</Text>
            <View style={styles.tileRow}>
              {sortedHand.map((tile) => (
                <DraggableHandTile
                  key={tile}
                  tile={tile}
                  enabled={canDiscard && !acting}
                  getPondRect={() => pondRectRef.current}
                  onDiscard={discard}
                  onDragStart={() => {
                    measurePond()
                    setDragActive(true)
                  }}
                  onDragEnd={() => {
                    setDragActive(false)
                    setDragOverPond(false)
                  }}
                  onDragOverChange={setDragOverPond}
                />
              ))}
            </View>

            {myState?.melds?.length ? (
              <>
                <Text style={styles.section}>Melds</Text>
                {myState.melds.map((meld, index) => (
                  <View key={`${meld.type}-${index}`} style={styles.meldRow}>
                    <Text style={styles.meldType}>{meld.type.toUpperCase()}</Text>
                    <View style={styles.meldTiles}>
                      {meld.tiles.map((tile) => (
                        <MahjongTileFace key={tile} tile={tile} compact />
                      ))}
                    </View>
                  </View>
                ))}
              </>
            ) : null}
          </>
        )}

        {canClaim && hasClaimOptions ? (
          <View style={styles.actionPanel}>
            <Text style={styles.actionTitle}>Claim window</Text>
            {meldClaims.length > 0 ? (
              <View style={styles.actionRow}>
                {meldClaims.map((meld) => (
                  <Pressable
                    key={`${meld.type}-${meld.tiles.join('')}`}
                    style={[styles.meldBtn, styles.flexBtn, acting && styles.btnDisabled]}
                    disabled={acting}
                    onPress={() => claimMeld(meld)}
                  >
                    <Text style={styles.meldBtnText}>{meld.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.actionRow}>
              {canRon ? (
                <Pressable style={[styles.primaryBtn, styles.flexBtn, acting && styles.btnDisabled]} disabled={acting} onPress={claimMahjong}>
                  <Text style={styles.primaryBtnText}>Mahjong</Text>
                </Pressable>
              ) : null}
              <Pressable style={[styles.secondaryBtn, styles.flexBtn, acting && styles.btnDisabled]} disabled={acting} onPress={passClaim}>
                <Text style={styles.secondaryBtnText}>Pass</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {canSelfWin || selfKongOptions.length > 0 ? (
          <View style={styles.actionPanel}>
            <Text style={styles.actionTitle}>Your turn</Text>
            {canSelfWin ? (
              <Pressable
                style={[styles.primaryBtn, acting && styles.btnDisabled]}
                disabled={acting}
                onPress={claimMahjong}
              >
                <Text style={styles.primaryBtnText}>Mahjong</Text>
              </Pressable>
            ) : null}
            {selfKongOptions.length > 0 ? (
              <View style={styles.actionRow}>
                {selfKongOptions.map((option) => (
                  <Pressable
                    key={`self-kong-${option.source}-${option.tile}`}
                    style={[styles.meldBtn, styles.flexBtn, acting && styles.btnDisabled]}
                    disabled={acting}
                    onPress={() => declareSelfKong(option)}
                  >
                    <Text style={styles.meldBtnText}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {canRiichi ? (
          <Pressable
            style={[styles.secondaryBtn, acting && styles.btnDisabled]}
            disabled={acting}
            onPress={declareRiichi}
          >
            <Text style={styles.secondaryBtnText}>Declare riichi</Text>
          </Pressable>
        ) : null}

      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  content: { paddingBottom: 32, gap: 12 },
  status: { color: theme.textSecondary, fontSize: 14 },
  viewerNote: { color: theme.textFaint, fontSize: 13, textAlign: 'center', marginTop: 4 },
  section: { color: theme.text, fontSize: 16, fontWeight: '600', marginTop: 4 },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  meldBtn: {
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  meldBtnText: { color: theme.primaryMuted, fontWeight: '800', fontSize: 14 },
  meldRow: { gap: 6, marginBottom: 8 },
  meldType: { color: theme.primaryMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  meldTiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  actionPanel: { backgroundColor: theme.surface, borderRadius: 12, padding: 14, gap: 10 },
  actionTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
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
})
