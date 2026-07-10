import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { BingoCalledNumber, BingoCard, Game, Player } from '@fateround/shared'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { FinishedPanel, GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postBingoMark } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import {
  BINGO_CALLED_NUMBER_SELECT,
  BINGO_CARD_SELECT,
} from '@/lib/supabase-selects'

type Screen = 'loading' | 'join' | 'waiting' | 'active' | 'finished' | 'not_found'

const BINGO_COLUMNS = ['B', 'I', 'N', 'G', 'O']
const FREE_INDEX = 12
const DISPLAY_ORDER = Array.from({ length: 25 }, (_, pos) => (pos % 5) * 5 + Math.floor(pos / 5))

export function BingoPlayerView({ gameCode }: { gameCode: string }) {
  const [card, setCard] = useState<BingoCard | null>(null)
  const [calledNumbers, setCalledNumbers] = useState<BingoCalledNumber[]>([])
  const [marking, setMarking] = useState(false)

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
      const res = await getSupabase()
        .from('bingo_called_numbers')
        .select(BINGO_CALLED_NUMBER_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .order('called_at')
      if (res.error) return { state: null, ok: false }
      setCalledNumbers((res.data as BingoCalledNumber[]) ?? [])
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

  useGameTableSync(
    gameCode,
    ['players', { table: 'games', column: 'id' }, 'bingo_called_numbers', 'bingo_cards'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const calledSet = new Set(calledNumbers.map((n) => n.number))
  const marked = new Set(card?.marked_indices ?? [])

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
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    return (
      <GameShell title="Bingo" subtitle={bootstrap.code}>
        <FinishedPanel title="Game over" />
      </GameShell>
    )
  }

  return (
    <GameShell title="Bingo" subtitle={`Code ${bootstrap.code}`}>
      <Text style={styles.calledTitle}>Called numbers</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.calledScroll}>
        <View style={styles.calledRow}>
          {calledNumbers.map((entry) => (
            <View key={entry.id} style={styles.calledChip}>
              <Text style={styles.calledText}>{entry.number}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

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
            {DISPLAY_ORDER.map((cellIndex) => {
              const number = card.cells[cellIndex]
              const isFree = cellIndex === FREE_INDEX
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
        </>
      ) : (
        <Text style={styles.waitingCard}>Waiting for your bingo card…</Text>
      )}
    </GameShell>
  )
}

const styles = StyleSheet.create({
  calledTitle: { color: '#9ca3af', fontSize: 14 },
  calledScroll: { maxHeight: 44 },
  calledRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  calledChip: {
    backgroundColor: '#17171d',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  calledText: { color: '#fff', fontWeight: '700' },
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
  waitingCard: { color: '#9ca3af', textAlign: 'center', marginTop: 24 },
})
