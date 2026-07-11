import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Game, Player } from '@fateround/shared'
import { getSupabase, GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase'
import { startGame, postPlayAgain } from '@/lib/game-api'
import { gameWebUrl } from '@/lib/config'
import { gameHasMobileVoice } from '@/lib/voice-games'
import { VoiceRail } from '@/components/voice/VoiceRail'

type Props = {
  gameCode: string
  hostToken: string
}

/**
 * Generic host lobby. The host watches players arrive, shares the code, and starts
 * the game. Once active, HostGameScreen routes to the in-game host dashboard.
 */
export function HostLobbyScreen({ gameCode, hostToken }: Props) {
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = getSupabase()
    const [gameRes, playersRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (!gameRes.error && gameRes.data) setGame(gameRes.data as Game)
    if (!playersRes.error) setPlayers((playersRes.data ?? []) as Player[])
    setLoading(false)
  }, [gameCode])

  useEffect(() => {
    void load()
    const supabase = getSupabase()
    const channel = supabase
      .channel(`host-lobby-${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        () => void load()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  const onShare = useCallback(async () => {
    try {
      await Share.share({
        message: `Join my game on Fate Round — code ${gameCode}\n${gameWebUrl(gameCode)}`,
      })
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  }, [gameCode])

  const onStart = useCallback(async () => {
    setStarting(true)
    setError(null)
    try {
      await startGame(gameCode, hostToken)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the game')
    } finally {
      setStarting(false)
    }
  }, [gameCode, hostToken, load])

  const onPlayAgain = useCallback(async () => {
    setReplaying(true)
    setError(null)
    try {
      await postPlayAgain(gameCode, hostToken, true)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set up play again')
    } finally {
      setReplaying(false)
    }
  }, [gameCode, hostToken, load])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#f43f5e" size="large" />
      </View>
    )
  }

  const activePlayers = players.filter((p) => !p.spectator)
  const finished = game?.status === 'finished'
  const replayLobby = game?.status === 'waiting' && game.replay_pending === true
  const readyCount = activePlayers.length

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {game && gameHasMobileVoice(game.game_type) ? (
        <VoiceRail gameCode={gameCode} mode="host" hostToken={hostToken} />
      ) : null}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>Hosting</Text>
        <Text style={styles.title}>{game?.title || 'Game'}</Text>

        <Pressable style={styles.codeCard} onPress={onShare}>
          <Text style={styles.codeLabel}>Game code — tap to share</Text>
          <Text style={styles.code}>{gameCode}</Text>
        </Pressable>

        <View style={styles.rosterHeader}>
          <Text style={styles.sectionTitle}>Players</Text>
          <Text style={styles.count}>{activePlayers.length}</Text>
        </View>

        {activePlayers.length === 0 ? (
          <Text style={styles.empty}>Waiting for players to join…</Text>
        ) : (
          activePlayers.map((p) => (
            <View key={p.id} style={styles.playerRow}>
              <Text style={styles.playerName}>{p.name}</Text>
            </View>
          ))
        )}

        {finished ? (
          <Text style={styles.finishedHint}>
            Game finished. Tap play again to reopen the lobby — players will ready up, then you start the next round.
          </Text>
        ) : replayLobby ? (
          <Text style={styles.replayHint}>
            Play again lobby open — {readyCount} player{readyCount === 1 ? '' : 's'} ready. Start when everyone is in.
          </Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        {finished ? (
          <Pressable
            style={[styles.startButton, replaying && styles.startButtonDisabled]}
            onPress={onPlayAgain}
            disabled={replaying}
          >
            {replaying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.startButtonText}>Play again · same settings</Text>
            )}
          </Pressable>
        ) : replayLobby ? (
          <Pressable
            style={[styles.startButton, (starting || readyCount === 0) && styles.startButtonDisabled]}
            onPress={onStart}
            disabled={starting || readyCount === 0}
          >
            {starting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.startButtonText}>Start next round</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[styles.startButton, (starting || activePlayers.length === 0) && styles.startButtonDisabled]}
            onPress={onStart}
            disabled={starting || activePlayers.length === 0}
          >
            {starting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.startButtonText}>Start game</Text>
            )}
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0f' },
  centered: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 24, gap: 8, paddingBottom: 32 },
  eyebrow: { color: '#f43f5e', fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  codeCard: {
    backgroundColor: '#17171d',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  codeLabel: { color: '#9ca3af', fontSize: 13, marginBottom: 6 },
  code: { color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: 8 },
  rosterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  count: { color: '#9ca3af', fontSize: 16, fontWeight: '600' },
  empty: { color: '#6b7280', fontSize: 15, paddingVertical: 12 },
  playerRow: {
    backgroundColor: '#17171d',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  playerName: { color: '#fff', fontSize: 16, fontWeight: '500' },
  finishedHint: {
    color: '#d1d5db',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  replayHint: {
    color: '#fda4af',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  error: { color: '#f87171', fontSize: 15, marginTop: 12 },
  footer: { padding: 24, borderTopColor: '#1c1c24', borderTopWidth: 1 },
  startButton: { backgroundColor: '#f43f5e', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  startButtonDisabled: { opacity: 0.5 },
  startButtonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
})
