import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game } from '@fateround/shared'
import { postQuickDrawAdvance, postQuickDrawGuessAdvance } from '@/lib/game-api'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Host "skip phase" control for Quick Draw, surfaced in the ⚙ Host settings sheet.
 * The game already auto-advances on its timers — this just lets the host cut the
 * current phase short. Renders nothing unless the game is an active Quick Draw.
 */
export function QuickDrawHostAdvanceControl({
  gameCode,
  hostToken,
  game,
  onReload,
}: {
  gameCode: string
  hostToken: string
  game: Pick<Game, 'status' | 'game_type' | 'quick_draw_variant'>
  onReload: () => void | Promise<unknown>
}) {
  const styles = useThemedStyles(makeStyles)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (game.game_type !== 'quick_draw' || game.status !== 'active') return null
  const isGuess = game.quick_draw_variant === 'guess'

  const advance = async () => {
    if (acting) return
    setActing(true)
    setError(null)
    try {
      if (isGuess) await postQuickDrawGuessAdvance(gameCode, hostToken)
      else await postQuickDrawAdvance(gameCode, hostToken, true)
      await onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to advance')
    } finally {
      setActing(false)
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Quick Draw</Text>
      <Pressable style={[styles.btn, acting && styles.btnDisabled]} disabled={acting} onPress={() => void advance()}>
        <Text style={styles.btnText}>{acting ? 'Skipping…' : 'Skip to next phase'}</Text>
      </Pressable>
      <Text style={styles.note}>The game advances on its own timer — use this only to skip ahead.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      gap: 8,
    },
    label: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    btn: {
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: theme.bg,
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: theme.text, fontSize: 14, fontWeight: '700' },
    note: { color: theme.textMuted, fontSize: 11 },
    error: { color: '#ef4444', fontSize: 12 },
  })
