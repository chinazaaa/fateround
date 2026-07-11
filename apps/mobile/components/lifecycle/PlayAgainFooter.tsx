import { useEffect } from 'react'
import { uniqueTopic } from '@/lib/realtime'
import { StyleSheet, Text } from 'react-native'
import type { Game } from '@fateround/shared'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { getSupabase } from '@/lib/supabase'
import { useIsHostView } from '@/components/host/HostViewContext'

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
  const styles = useThemedStyles(makeStyles)
  const isHost = useIsHostView()

  useEffect(() => {
    if (game.status !== 'finished') return

    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`play-again-${gameCode}`))
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
        {isHost
          ? 'Tap ⚙ Host to play again or return to the lobby.'
          : "If the host starts another round, you'll get a ready-up prompt in the lobby."}
      </Text>
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
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
