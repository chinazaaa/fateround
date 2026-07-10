import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import type { Game } from '@fateround/shared'
import { getSupabase } from '@/lib/supabase'

type Props = {
  gameCode: string
  game: Game
  onReplayReady: () => void | Promise<unknown>
}

/**
 * Shown on finish screens while status is still `finished`. When the host calls
 * play-again (`waiting` + `replay_pending`), reload so LobbyView shows ReplayReadyRing.
 */
export function PlayAgainFooter({ gameCode, game, onReplayReady }: Props) {
  useEffect(() => {
    if (game.status !== 'finished') return

    const supabase = getSupabase()
    const channel = supabase
      .channel(`play-again-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const next = payload.new as Game
          if (next.status === 'waiting' && next.replay_pending) {
            void Promise.resolve(onReplayReady())
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [game.status, gameCode, onReplayReady])

  if (game.status !== 'finished') return null

  return (
    <View style={styles.wrap}>
      <ActivityIndicator color="#fda4af" size="small" />
      <Text style={styles.text}>Waiting for the host to set up another round…</Text>
      <Text style={styles.sub}>When they tap play again, you'll get a ready-up prompt in the lobby.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#17171d',
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  text: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  sub: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
})
