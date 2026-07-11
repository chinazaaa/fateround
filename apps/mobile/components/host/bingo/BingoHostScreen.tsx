import { useCallback, useEffect, useState } from 'react'
import { uniqueTopic } from '@/lib/realtime'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
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
import { CalledNumbersBoardSection } from '@/components/games/bingo/CalledNumbersBoardSection'
import { GameFinishedActions } from '@/components/lifecycle/GameFinishedActions'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type BingoClaim = { id: string; player_id: string; status: string }

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  onReload: () => void
}

export function BingoHostScreen({ gameCode, hostToken, game, players, onReload }: Props) {
  const styles = useThemedStyles(makeStyles)
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
      .channel(uniqueTopic(`host-bingo-${gameCode}`))
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

  const resetGame = async (sameSettings: boolean) => {
    setActing(true)
    try {
      await postPlayAgain(gameCode, hostToken, sameSettings)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Play again failed')
    } finally {
      setActing(false)
    }
  }

  const confirmPlayAgain = () => {
    Alert.alert(
      'Play again · same settings',
      'Reopen the game with the same players and settings. Everyone readies up, then you start the next round.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Play again', onPress: () => void resetGame(true) },
      ]
    )
  }

  const confirmReturnToLobby = () => {
    Alert.alert(
      'Return to lobby',
      'Reopen the lobby so you can tweak settings or let new people join before starting again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Return to lobby', onPress: () => void resetGame(false) },
      ]
    )
  }

  const lastCalled = calledNumbers.length > 0 ? calledNumbers[calledNumbers.length - 1] : null
  const manualMode = game.bingo_call_mode !== 'auto'
  const activePlayers = players.filter((p) => !p.spectator)

  return (
    <HostChrome gameCode={gameCode} hostToken={hostToken} game={game} players={players} onReload={onReload}>
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

      <CalledNumbersBoardSection
        calledNumbers={new Set(calledNumbers.map((n) => n.number))}
        lastCalled={lastCalled?.number ?? null}
        defaultOpen
      />

      {game.status === 'active' && !winner ? (
        <Pressable style={[styles.secondaryBtn, acting && styles.btnDisabled]} disabled={acting} onPress={() => void onFinish()}>
          <Text style={styles.secondaryBtnText}>End game</Text>
        </Pressable>
      ) : null}

      {game.status === 'finished' ? (
        <>
          <Pressable style={[styles.primaryBtn, acting && styles.btnDisabled]} disabled={acting} onPress={confirmPlayAgain}>
            <Text style={styles.primaryBtnText}>Play again · same settings</Text>
          </Pressable>
          <Pressable style={[styles.secondaryBtn, acting && styles.btnDisabled]} disabled={acting} onPress={confirmReturnToLobby}>
            <Text style={styles.secondaryBtnText}>Return to lobby</Text>
          </Pressable>
          <GameFinishedActions
            gameCode={gameCode}
            gameType={game.game_type}
            gameTitle={game.title}
            resultTitle={
              winner ? `${players.find((p) => p.id === winner.player_id)?.name ?? 'Player'} wins!` : undefined
            }
          />
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </HostChrome>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
  latest: {
    backgroundColor: theme.primarySoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.primary,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  latestLabel: { color: theme.primaryMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  latestNumber: { color: theme.text, fontSize: 32, fontWeight: '800' },
  autoHint: { color: theme.textMuted, fontSize: 14, textAlign: 'center' },
  winner: { color: '#86efac', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  sectionTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
  calledScroll: { maxHeight: 44 },
  calledRow: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: theme.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: theme.text, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  // White on the solid rose button — intentional, correct in both schemes.
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: theme.text, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  error: { color: theme.error, fontSize: 14 },
})
