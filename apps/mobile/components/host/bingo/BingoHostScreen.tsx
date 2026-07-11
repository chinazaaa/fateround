import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { BingoCalledNumber, Game, Player } from '@fateround/shared'
import { formatBingoNumber } from '@fateround/shared/bingo'
import {
  postBingoCall,
  postFinishGame,
  postPlayAgain,
} from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { BINGO_CALLED_NUMBER_SELECT, BINGO_CLAIM_SELECT } from '@/lib/supabase-selects'
import { useBingoAutoCall } from '@/hooks/useBingoAutoCall'
import { HostChrome } from '@/components/host/HostChrome'
import { HostPlayAlongCard } from '@/components/host/HostPlayAlongCard'

type BingoClaim = { id: string; player_id: string; status: string }

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  onReload: () => void
}

export function BingoHostScreen({ gameCode, hostToken, game, players, onReload }: Props) {
  const [calledNumbers, setCalledNumbers] = useState<BingoCalledNumber[]>([])
  const [winner, setWinner] = useState<BingoClaim | null>(null)
  const [calling, setCalling] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadBingo = useCallback(async () => {
    const [calledRes, claimRes] = await Promise.all([
      getSupabase()
        .from('bingo_called_numbers')
        .select(BINGO_CALLED_NUMBER_SELECT)
        .eq('game_id', gameCode)
        .order('called_at'),
      getSupabase()
        .from('bingo_claims')
        .select(BINGO_CLAIM_SELECT)
        .eq('game_id', gameCode)
        .eq('status', 'approved')
        .maybeSingle(),
    ])
    if (!calledRes.error) setCalledNumbers((calledRes.data as BingoCalledNumber[]) ?? [])
    if (!claimRes.error) setWinner((claimRes.data as BingoClaim | null) ?? null)
  }, [gameCode])

  useEffect(() => {
    void loadBingo()
    const supabase = getSupabase()
    const channel = supabase
      .channel(`host-bingo-${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bingo_called_numbers', filter: `game_id=eq.${gameCode}` },
        () => void loadBingo()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bingo_claims', filter: `game_id=eq.${gameCode}` },
        () => void loadBingo()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, loadBingo])

  useBingoAutoCall({
    gameCode,
    game,
    enabled: game.status === 'active',
    onSynced: () => void loadBingo(),
  })

  const onCall = async () => {
    setCalling(true)
    setError(null)
    try {
      await postBingoCall(gameCode, hostToken, { random: true })
      await loadBingo()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Call failed')
    } finally {
      setCalling(false)
    }
  }

  const onFinish = async () => {
    setActing(true)
    try {
      await postFinishGame(gameCode, hostToken)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish')
    } finally {
      setActing(false)
    }
  }

  const onPlayAgain = async () => {
    setActing(true)
    try {
      await postPlayAgain(gameCode, hostToken, true)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Play again failed')
    } finally {
      setActing(false)
    }
  }

  const lastCalled = calledNumbers.length > 0 ? calledNumbers[calledNumbers.length - 1] : null
  const manualMode = game.bingo_call_mode !== 'auto'
  const activePlayers = players.filter((p) => !p.spectator)

  return (
    <HostChrome gameCode={gameCode} hostToken={hostToken} game={game}>
      <View style={styles.statsRow}>
        <Text style={styles.stat}>Players: {activePlayers.length}</Text>
        <Text style={styles.stat}>Called: {calledNumbers.length}/75</Text>
      </View>

      {lastCalled ? (
        <View style={styles.latest}>
          <Text style={styles.latestLabel}>Latest</Text>
          <Text style={styles.latestNumber}>{formatBingoNumber(lastCalled.number)}</Text>
        </View>
      ) : null}

      {game.status === 'active' && manualMode ? (
        <Pressable style={[styles.primaryBtn, calling && styles.btnDisabled]} disabled={calling} onPress={() => void onCall()}>
          {calling ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Call next number</Text>}
        </Pressable>
      ) : null}

      {game.status === 'active' && !manualMode ? (
        <Text style={styles.autoHint}>Auto-call is on — this device keeps numbers in sync.</Text>
      ) : null}

      {winner ? (
        <Text style={styles.winner}>
          Winner: {players.find((p) => p.id === winner.player_id)?.name ?? 'Player'}
        </Text>
      ) : null}

      <Text style={styles.sectionTitle}>Called numbers</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.calledScroll}>
        <View style={styles.calledRow}>
          {calledNumbers.map((entry) => (
            <View key={entry.id} style={styles.chip}>
              <Text style={styles.chipText}>{formatBingoNumber(entry.number)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <HostPlayAlongCard gameCode={gameCode} />

      {game.status === 'active' && !winner ? (
        <Pressable style={[styles.secondaryBtn, acting && styles.btnDisabled]} disabled={acting} onPress={() => void onFinish()}>
          <Text style={styles.secondaryBtnText}>End game</Text>
        </Pressable>
      ) : null}

      {game.status === 'finished' ? (
        <Pressable style={[styles.primaryBtn, acting && styles.btnDisabled]} disabled={acting} onPress={() => void onPlayAgain()}>
          <Text style={styles.primaryBtnText}>Play again</Text>
        </Pressable>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </HostChrome>
  )
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { color: '#9ca3af', fontSize: 14, fontWeight: '600' },
  latest: {
    backgroundColor: '#2a1220',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f43f5e',
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  latestLabel: { color: '#fda4af', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  latestNumber: { color: '#fff', fontSize: 32, fontWeight: '800' },
  autoHint: { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
  winner: { color: '#86efac', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  calledScroll: { maxHeight: 44 },
  calledRow: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: '#17171d', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: '#fff', fontWeight: '700' },
  primaryBtn: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a35',
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  error: { color: '#f87171', fontSize: 14 },
})
