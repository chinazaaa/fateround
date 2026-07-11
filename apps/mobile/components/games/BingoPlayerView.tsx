import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { BingoCalledNumber, BingoCard, Game, Player } from '@fateround/shared'
import { BINGO_MIN_PLAYERS, formatBingoNumber, hasBingoWin } from '@fateround/shared/bingo'
import { playerIsViewer } from '@fateround/shared/viewers'
import { BingoCardGrid } from '@/components/games/bingo/BingoCardGrid'
import { BingoCardLegend } from '@/components/games/bingo/BingoCardLegend'
import { CalledNumbersBoard } from '@/components/games/bingo/CalledNumbersBoard'
import { CalledNumbersBoardSection } from '@/components/games/bingo/CalledNumbersBoardSection'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { ReplayReadyRing } from '@/components/lifecycle/ReplayReadyRing'
import { ViewerModeBanner } from '@/components/lifecycle/ViewerModeBanner'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { winnerLeaderboard } from '@/lib/finish-leaderboards'
import { postBingoClaim, postBingoMark } from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { BINGO_CALLED_NUMBER_SELECT, BINGO_CARD_SELECT, BINGO_CLAIM_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Screen = 'loading' | 'join' | 'waiting' | 'active' | 'finished' | 'not_found'

type BingoClaim = { id: string; player_id: string; status: string }

export function BingoPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [card, setCard] = useState<BingoCard | null>(null)
  const [calledNumbers, setCalledNumbers] = useState<BingoCalledNumber[]>([])
  const [winnerClaim, setWinnerClaim] = useState<BingoClaim | null>(null)
  const [marking, setMarking] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  const loadCard = useCallback(
    async (playerId: string): Promise<boolean> => {
      const res = await getSupabase()
        .from('bingo_cards')
        .select(BINGO_CARD_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .eq('player_id', playerId)
        .maybeSingle()
      if (res.error) return false
      setCard((res.data as BingoCard | null) ?? null)
      return true
    },
    [gameCode]
  )

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: null; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [calledRes, claimRes] = await Promise.all([
        getSupabase()
          .from('bingo_called_numbers')
          .select(BINGO_CALLED_NUMBER_SELECT)
          .eq('game_id', code)
          .order('called_at'),
        getSupabase()
          .from('bingo_claims')
          .select(BINGO_CLAIM_SELECT)
          .eq('game_id', code)
          .eq('status', 'approved')
          .maybeSingle(),
      ])
      if (calledRes.error || claimRes.error) return { state: null, ok: false }
      setCalledNumbers((calledRes.data as BingoCalledNumber[]) ?? [])
      setWinnerClaim((claimRes.data as BingoClaim | null) ?? null)
      return { state: null, ok: true }
    },
    [gameCode]
  )

  const afterResolve = useCallback(
    async (game: Game, playerId: string | null) => {
      if (playerId && game.status !== 'waiting') {
        await loadCard(playerId)
      } else {
        setCard(null)
      }
    },
    [loadCard]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null): Screen => {
    if (!playerId) return 'join'
    if (game.status === 'waiting') return 'waiting'
    if (game.status === 'active') return 'active'
    return 'finished'
  }, [])

  const bootstrap = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen,
    afterResolve,
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    ['players', { table: 'games', column: 'id' }, 'bingo_called_numbers', 'bingo_cards', 'bingo_claims'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const calledSet = useMemo(() => new Set(calledNumbers.map((n) => n.number)), [calledNumbers])
  const lastCalled = calledNumbers.length > 0 ? calledNumbers[calledNumbers.length - 1] : null
  const me = useMemo(
    () => bootstrap.players.find((p) => p.id === bootstrap.myPlayerId),
    [bootstrap.players, bootstrap.myPlayerId]
  )
  // A spectator/late-joiner watches called numbers instead of holding a card.
  const isViewer = !!(bootstrap.game && me && playerIsViewer(me, bootstrap.game))
  const canClaim = useMemo(
    () =>
      !isViewer &&
      !!card &&
      hasBingoWin(card.cells, card.marked_indices, 'line') &&
      bootstrap.game?.status === 'active',
    [isViewer, card, bootstrap.game?.status]
  )

  const markCell = async (cellIndex: number) => {
    if (!bootstrap.myResumeToken || !card) return
    setMarking(true)
    try {
      playSound('pop')
      await postBingoMark(bootstrap.code, bootstrap.myResumeToken, cellIndex)
      await bootstrap.load()
    } finally {
      setMarking(false)
    }
  }

  const claimBingo = async () => {
    if (!bootstrap.myResumeToken || claiming) return
    setClaiming(true)
    setClaimError(null)
    try {
      await postBingoClaim(bootstrap.code, bootstrap.myResumeToken)
      await bootstrap.load()
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Invalid bingo')
    } finally {
      setClaiming(false)
    }
  }

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
        submitLabel="Join Bingo"
        hint="You'll get a random card when the host starts. Called numbers turn blue on your card — tap them to mark them green."
        footer={<BingoCardLegend />}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    // "Play again · same settings" reopened the lobby with the ready-up ring:
    // readiness = holding a seat (tap to ready/sit out).
    if (bootstrap.game.replay_pending) {
      return (
        <GameShell bootstrap={bootstrap} title="Bingo">
          <ReplayReadyRing
            gameCode={bootstrap.code}
            players={bootstrap.players}
            myPlayerId={bootstrap.myPlayerId}
            myResumeToken={bootstrap.myResumeToken ?? null}
            minPlayers={BINGO_MIN_PLAYERS}
            onReload={() => bootstrap.load()}
          />
        </GameShell>
      )
    }
    return <LobbyView {...lobbyProps!} onLeft={onLeft} activity={<BingoCardLegend />} />
  }
  if (!bootstrap.game) return <GameLoading />

  const winnerPlayer = winnerClaim ? bootstrap.players.find((p) => p.id === winnerClaim.player_id) : null

  if (bootstrap.screen === 'finished') {
    return (
      <GameFinishPanel
        bootstrap={bootstrap}
        emoji={winnerPlayer ? '🎉' : '🏁'}
        title={winnerPlayer ? `${winnerPlayer.name} wins!` : 'This game has ended'}
        subtitle={winnerPlayer ? 'Final results' : undefined}
        detail={winnerPlayer ? 'BINGO!' : 'Thanks for playing. Join a new game from the home screen.'}
        leaderboard={
          winnerPlayer ? winnerLeaderboard(winnerClaim?.player_id, bootstrap.players, bootstrap.myPlayerId) : undefined
        }
        winnerPlayerId={winnerClaim?.player_id ?? null}
        roundKey={winnerClaim?.id ?? null}
        notice={
          card ? (
            <View style={styles.finishedCard}>
              <Text style={styles.finishedCardLabel}>Your card</Text>
              <BingoCardGrid
                cells={card.cells}
                markedIndices={card.marked_indices}
                calledNumbers={calledSet}
                disabled
                onMark={() => {}}
              />
            </View>
          ) : undefined
        }
      />
    )
  }

  return (
    <GameShell bootstrap={bootstrap} title="Bingo" subtitle={`Code ${bootstrap.code}`}>
      {isViewer && bootstrap.myPlayerId && me && bootstrap.game ? (
        <ViewerModeBanner
          gameCode={bootstrap.code}
          playerId={bootstrap.myPlayerId}
          game={bootstrap.game}
          player={me}
          players={bootstrap.players}
          onPromoted={() => void bootstrap.load()}
        />
      ) : null}

      {lastCalled ? (
        <View style={styles.latestCall}>
          <Text style={styles.latestLabel}>Latest call</Text>
          <Text style={styles.latestNumber}>{formatBingoNumber(lastCalled.number)}</Text>
        </View>
      ) : (
        <Text style={styles.waitingCall}>Waiting for the first number…</Text>
      )}

      <Text style={styles.calledTitle}>Called ({calledNumbers.length})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.calledScroll}>
        <View style={styles.calledRow}>
          {calledNumbers.map((entry) => (
            <View key={entry.id} style={[styles.calledChip, entry.id === lastCalled?.id && styles.calledChipLatest]}>
              <Text style={styles.calledText}>{formatBingoNumber(entry.number)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {canClaim ? (
        <Pressable
          style={[styles.bingoBtn, claiming && styles.bingoBtnDisabled]}
          onPress={() => void claimBingo()}
          disabled={claiming}
        >
          {claiming ? (
            // white on the solid rose bingo button — intentional
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.bingoBtnText}>BINGO!</Text>
          )}
        </Pressable>
      ) : null}
      {claimError ? <Text style={styles.error}>{claimError}</Text> : null}

      {card ? (
        <>
          <BingoCardGrid
            cells={card.cells}
            markedIndices={card.marked_indices}
            calledNumbers={calledSet}
            marking={marking}
            onMark={(cellIndex) => void markCell(cellIndex)}
          />
          <Text style={styles.legend}>Tap callable numbers when they are called. Center is free.</Text>
          <BingoCardLegend />
          <CalledNumbersBoardSection calledNumbers={calledSet} lastCalled={lastCalled?.number ?? null} />
        </>
      ) : isViewer ? (
        <View style={styles.viewerBoard}>
          <Text style={styles.viewerHint}>You&apos;re watching — no card is dealt to spectators.</Text>
          <CalledNumbersBoard calledNumbers={calledSet} lastCalled={lastCalled?.number ?? null} />
        </View>
      ) : (
        <Text style={styles.waitingCard}>Waiting for your bingo card…</Text>
      )}
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    latestCall: {
      backgroundColor: theme.primarySoft,
      borderRadius: 12,
      padding: 14,
      alignItems: 'center',
      gap: 4,
    },
    latestLabel: { color: theme.primaryMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    latestNumber: { color: theme.text, fontSize: 28, fontWeight: '800' },
    waitingCall: { color: theme.textMuted, textAlign: 'center' },
    calledTitle: { color: theme.textMuted, fontSize: 14, marginTop: 8 },
    calledScroll: { maxHeight: 44 },
    calledRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
    calledChip: {
      backgroundColor: theme.surface,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    calledChipLatest: { borderWidth: 1, borderColor: theme.primary },
    calledText: { color: theme.text, fontWeight: '700', fontSize: 13 },
    bingoBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    bingoBtnDisabled: { opacity: 0.7 },
    // white on the solid rose bingo button — intentional
    bingoBtnText: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
    error: { color: theme.error, textAlign: 'center', fontSize: 14 },
    legend: { color: theme.textFaint, fontSize: 12, textAlign: 'center', marginTop: 8 },
    waitingCard: { color: theme.textMuted, textAlign: 'center', marginTop: 24 },
    viewerBoard: { gap: 12, marginTop: 8 },
    viewerHint: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
    finishedCard: { gap: 8, alignItems: 'center', marginTop: 4 },
    finishedCardLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
  })
