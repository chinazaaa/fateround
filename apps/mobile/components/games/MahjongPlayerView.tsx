import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type Game, type MahjongPlayerState, type Player } from '@fateround/shared'
import { batch8GameLabel } from '@fateround/shared/batch-8-games'
import {
  currentMahjongPlayerId,
  mahjongPhaseLabel,
  mahjongSecondsLeft,
  mahjongTileShortLabel,
  playerName,
  sortMahjongTiles,
  stateFor,
  type MahjongStateResponse,
} from '@fateround/shared/mahjong'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { FinishedPanel, GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { getPlayerSession } from '@/lib/secure-session'
import {
  getMahjongState,
  postMahjongClaim,
  postMahjongDiscard,
  postMahjongPass,
  postMahjongRiichi,
} from '@/lib/game-api'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function MahjongPlayerView({ gameCode }: { gameCode: string }) {
  const [mahjongState, setMahjongState] = useState<MahjongStateResponse | null>(null)
  const [acting, setActing] = useState(false)
  const [timerTick, setTimerTick] = useState(0)

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
  const sortedHand = myState ? sortMahjongTiles(myState.hand ?? []) : []
  void timerTick
  const secondsLeft = mahjongSecondsLeft(session?.turn_deadline_at)

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
        onJoin={() => void bootstrap.join()}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game) {
    return <LobbyView game={bootstrap.game} players={bootstrap.players} myPlayerId={bootstrap.myPlayerId} />
  }
  if (bootstrap.screen === 'finished' && bootstrap.game) {
    const winner = bootstrap.players.find((p) => p.id === session?.winner_player_id)
    return (
      <FinishedPanel
        title={batch8GameLabel('mahjong')}
        detail={winner ? `${winner.name} wins` : session?.status_message ?? 'Hand over'}
      />
    )
  }
  if (!bootstrap.game || !session) return <GameLoading />

  const turnName = playerName(bootstrap.players, turnPlayerId)
  const canDiscard = isMyTurn && session.phase === 'discard' && sortedHand.length > 0
  const inClaimWindow = session.phase === 'claim' && session.last_discard != null
  const alreadyPassed = bootstrap.myPlayerId ? session.claim_passes.includes(bootstrap.myPlayerId) : false
  const canClaim = inClaimWindow && !alreadyPassed && !isMyTurn

  return (
    <GameShell title={batch8GameLabel('mahjong')} subtitle={mahjongPhaseLabel(session.phase)}>
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

        {session.last_discard ? (
          <View style={styles.discardBox}>
            <Text style={styles.discardLabel}>Last discard</Text>
            <Text style={styles.discardTile}>{mahjongTileShortLabel(session.last_discard.tile)}</Text>
            <Text style={styles.discardBy}>
              by {playerName(bootstrap.players, session.last_discard.player_id)}
            </Text>
          </View>
        ) : null}

        <Text style={styles.section}>Your hand ({sortedHand.length})</Text>
        <View style={styles.tileRow}>
          {sortedHand.map((tile) => (
            <Pressable
              key={tile}
              style={[styles.tile, canDiscard && styles.tileActive]}
              disabled={!canDiscard || acting}
              onPress={() => discard(tile)}
            >
              <Text style={styles.tileText}>{mahjongTileShortLabel(tile)}</Text>
            </Pressable>
          ))}
        </View>

        {myState?.melds?.length ? (
          <>
            <Text style={styles.section}>Melds</Text>
            {myState.melds.map((meld, index) => (
              <Text key={`${meld.type}-${index}`} style={styles.meld}>
                {meld.type.toUpperCase()}: {meld.tiles.map(mahjongTileShortLabel).join(' ')}
              </Text>
            ))}
          </>
        ) : null}

        {canClaim ? (
          <View style={styles.actionPanel}>
            <Text style={styles.actionTitle}>Claim window</Text>
            <View style={styles.actionRow}>
              <Pressable style={[styles.primaryBtn, styles.flexBtn, acting && styles.btnDisabled]} disabled={acting} onPress={claimMahjong}>
                <Text style={styles.primaryBtnText}>Mahjong</Text>
              </Pressable>
              <Pressable style={[styles.secondaryBtn, styles.flexBtn, acting && styles.btnDisabled]} disabled={acting} onPress={passClaim}>
                <Text style={styles.secondaryBtnText}>Pass</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {isMyTurn && session.phase === 'discard' && !myState?.riichi_declared ? (
          <Pressable
            style={[styles.secondaryBtn, acting && styles.btnDisabled]}
            disabled={acting}
            onPress={declareRiichi}
          >
            <Text style={styles.secondaryBtnText}>Declare riichi</Text>
          </Pressable>
        ) : null}

        <Text style={styles.section}>Seats</Text>
        {states.map((state: MahjongPlayerState) => (
          <View key={state.id} style={[styles.seatRow, state.player_id === turnPlayerId && styles.seatActive]}>
            <Text style={styles.seatName}>
              {playerName(bootstrap.players, state.player_id)} ({state.seat})
            </Text>
            <Text style={styles.seatMeta}>
              {state.hand_count ?? state.hand?.length ?? 0} tiles
              {state.riichi_declared ? ' · Riichi' : ''}
            </Text>
          </View>
        ))}
      </ScrollView>
    </GameShell>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32, gap: 12 },
  status: { color: '#d1d5db', fontSize: 14 },
  discardBox: { backgroundColor: '#17171d', borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 },
  discardLabel: { color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' },
  discardTile: { color: '#fff', fontSize: 28, fontWeight: '700' },
  discardBy: { color: '#9ca3af', fontSize: 13 },
  section: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 4 },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    backgroundColor: '#17171d',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a35',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  tileActive: { borderColor: '#f43f5e' },
  tileText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  meld: { color: '#d1d5db', fontSize: 14 },
  actionPanel: { backgroundColor: '#17171d', borderRadius: 12, padding: 14, gap: 10 },
  actionTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
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
  seatRow: { backgroundColor: '#17171d', borderRadius: 10, padding: 10 },
  seatActive: { borderColor: '#f43f5e', borderWidth: 1 },
  seatName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  seatMeta: { color: '#9ca3af', fontSize: 13, marginTop: 2 },
})
