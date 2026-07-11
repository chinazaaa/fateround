import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { postPlayAgain } from '@/lib/game-api'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import type { HostViewValue } from '@/components/host/HostViewContext'

type Props = {
  gameCode: string
  host: HostViewValue
}

/**
 * Host-only controls shown inline on the finish screen (instead of the
 * player-facing "wait for the host" hint): reopen the game with the ready-up
 * ring, or return to the full lobby. Rendered by GameFinishPanel when a host
 * view context is present.
 */
export function HostFinishedActions({ gameCode, host }: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [busy, setBusy] = useState<'replay' | 'lobby' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (key: 'replay' | 'lobby', sameSettings: boolean) => {
    setBusy(key)
    setError(null)
    try {
      await postPlayAgain(gameCode, host.hostToken, sameSettings, host.hostPlayerId)
      host.onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.primaryBtn, busy === 'replay' && styles.disabled]}
        disabled={!!busy}
        onPress={() => void run('replay', true)}
      >
        {busy === 'replay' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>Play again · same settings</Text>
        )}
      </Pressable>
      <Pressable
        style={[styles.secondaryBtn, busy === 'lobby' && styles.disabled]}
        disabled={!!busy}
        onPress={() => void run('lobby', false)}
      >
        {busy === 'lobby' ? (
          <ActivityIndicator color={theme.text} />
        ) : (
          <Text style={styles.secondaryText}>Return to lobby</Text>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { gap: theme.space.sm },
  primaryBtn: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryText: { color: theme.text, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  error: { color: theme.error, fontSize: 14, textAlign: 'center' },
})
