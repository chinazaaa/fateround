import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { Game } from '@fateround/shared'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { theme } from '@/constants/theme'
import { getSupabase } from '@/lib/supabase'

type Props = {
  gameCode: string
  game: Game
  onReplayReady: () => void | Promise<unknown>
}

/**
 * Shown on finish screens while status is still `finished`. Silently watches for
 * host play-again (`waiting` + `replay_pending`) and reloads when that happens.
 */
export function PlayAgainFooter({ gameCode, game, onReplayReady }: Props) {
  const router = useRouter()

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
    <SurfaceCard style={styles.wrap}>
      <Text style={styles.hint}>
        If the host starts another round, you'll get a ready-up prompt in the lobby.
      </Text>
      <AppButton label="Go home" variant="secondary" onPress={() => router.replace('/')} />
    </SurfaceCard>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'stretch',
    gap: theme.space.md,
  },
  hint: {
    color: theme.textFaint,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
})
