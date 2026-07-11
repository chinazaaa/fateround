import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { BingoCalledNumber, BingoCard, Game, Player } from '@fateround/shared'
import {
  BINGO_COLUMNS,
  BINGO_DISPLAY_ORDER,
  BINGO_FREE_INDEX,
  formatBingoNumber,
  hasBingoWin,
} from '@fateround/shared/bingo'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { winnerLeaderboard } from '@/lib/finish-leaderboards'
import { postBingoClaim, postBingoMark } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import {
  BINGO_CALLED_NUMBER_SELECT,
  BINGO_CARD_SELECT,
  BINGO_CLAIM_SELECT,
} from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'

type Screen = 'loading' | 'join' | 'waiting' | 'active' | 'finished' | 'not_found'

type BingoClaim = { id: string; player_id: string; status: string }

export function BingoPlayerView({ gameCode }: { gameCode: string }) {
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
        getSupabase().from('bingo_called_numbers').select(BINGO_CALLED_NUMBER_SELECT).eq('game_id', code).order('called_at'),
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
  const marked = useMemo(() => new Set(card?.marked_indices ?? []), [card?.marked_indices])
  const lastCalled = calledNumbers.length > 0 ? calledNumbers[calledNumbers.length - 1] : null
  const canClaim = useMemo(
    () => !!card && hasBingoWin(card.cells, card.marked_indices, 'line') && bootstrap.game?.status === 'active',
    [card, bootstrap.game?.status]
  )

  const markCell = async (cellIndex: number) => {
    if (!bootstrap.myResumeToken || !card) return
    setMarking(true)
    try {
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
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game) return <GameLoading />

  const winnerPlayer = winnerClaim
    ? bootstrap.players.find((p) => p.id === winnerClaim.player_id)
    : null

  if (bootstrap.screen === 'finished') {
    return (
      <GameFinishPanel
        bootstrap={bootstrap}
        emoji={winnerPlayer ? '🎉' : '🏁'}
        title={winnerPlayer ? `${winnerPlayer.name} wins!` : 'This game has ended'}
        subtitle={winnerPlayer ? 'Final results' : undefined}
        detail={
          winnerPlayer ? 'BINGO!' : 'Thanks for playing. Join a new game from the home screen.'
        }
        leaderboard={
          winnerPlayer
            ? winnerLeaderboard(winnerClaim?.player_id, bootstrap.players, bootstrap.myPlayerId)
            : undefined
        }
      />
    )
  }

  return (
    <GameShell bootstrap={bootstrap} title="Bingo" subtitle={`Code ${bootstrap.code}`}>
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
            <View
              key={entry.id}
              style={[styles.calledChip, entry.id === lastCalled?.id && styles.calledChipLatest]}
            >
              <Text style={styles.calledText}>{formatBingoNumber(entry.number)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {canClaim ? (
        <Pressable style={[styles.bingoBtn, claiming && styles.bingoBtnDisabled]} onPress={() => void claimBingo()} disabled={claiming}>
          {claiming ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.bingoBtnText}>BINGO!</Text>
          )}
        </Pressable>
      ) : null}
      {claimError ? <Text style={styles.error}>{claimError}</Text> : null}

      {card ? (
        <>
          <View style={styles.headerRow}>
            {BINGO_COLUMNS.map((letter) => (
              <Text key={letter} style={styles.headerLetter}>
                {letter}
              </Text>
            ))}
          </View>
          <View style={styles.cardGrid}>
            {BINGO_DISPLAY_ORDER.map((cellIndex) => {
              const number = card.cells[cellIndex]
              const isFree = cellIndex === BINGO_FREE_INDEX
              const isMarked = marked.has(cellIndex) || isFree
              const isCallable = isFree || calledSet.has(number)
              const canMark = isCallable && !isMarked && !marking
              return (
                <Pressable
                  key={cellIndex}
                  style={[
                    styles.cardCell,
                    isMarked && styles.cardCellMarked,
                    isCallable && !isMarked && styles.cardCellCallable,
                  ]}
                  disabled={!canMark}
                  onPress={() => void markCell(cellIndex)}
                >
                  <Text style={styles.cardCellText}>{isFree ? 'FREE' : number}</Text>
                </Pressable>
              )
            })}
          </View>
          <Text style={styles.legend}>Tap callable numbers when they are called. Center is free.</Text>
        </>
      ) : (
        <Text style={styles.waitingCard}>Waiting for your bingo card…</Text>
      )}
    </GameShell>
  )
}

const styles = StyleSheet.create({
  latestCall: {
    backgroundColor: '#3f1d2b',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  latestLabel: { color: '#fda4af', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  latestNumber: { color: '#fff', fontSize: 28, fontWeight: '800' },
  waitingCall: { color: '#9ca3af', textAlign: 'center' },
  calledTitle: { color: '#9ca3af', fontSize: 14, marginTop: 8 },
  calledScroll: { maxHeight: 44 },
  calledRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  calledChip: {
    backgroundColor: '#17171d',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  calledChipLatest: { borderWidth: 1, borderColor: '#f43f5e' },
  calledText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  bingoBtn: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  bingoBtnDisabled: { opacity: 0.7 },
  bingoBtnText: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  error: { color: '#fb7185', textAlign: 'center', fontSize: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 },
  headerLetter: { color: '#f43f5e', fontSize: 18, fontWeight: '800', width: 56, textAlign: 'center' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  cardCell: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#17171d',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2a35',
  },
  cardCellCallable: { borderColor: '#3b82f6', backgroundColor: '#172554' },
  cardCellMarked: { backgroundColor: '#14532d', borderColor: '#22c55e' },
  cardCellText: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  legend: { color: '#6b7280', fontSize: 12, textAlign: 'center', marginTop: 8 },
  waitingCard: { color: '#9ca3af', textAlign: 'center', marginTop: 24 },
})
