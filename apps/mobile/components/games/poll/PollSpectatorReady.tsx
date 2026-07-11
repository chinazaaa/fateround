import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { postPlayerReady } from '@/lib/game-api'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * "I'm in — ready to play" button for spectators sitting in the lobby.
 * POSTs /api/players/ready so they join the next round. Mirrors web
 * `isSpectatorInLobby` ready button.
 */
type Props = {
  gameCode: string
  resumeToken: string
  onReady: () => void
}

export function PollSpectatorReady({ gameCode, resumeToken, onReady }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await postPlayerReady(gameCode, resumeToken, true)
      onReady()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.hint}>You're watching. Tap below to join the next round.</Text>
      <Pressable style={[styles.btn, busy && styles.disabled]} disabled={busy} onPress={() => void submit()}>
        {busy ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.btnText}>I&apos;m in — ready to play</Text>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 10,
      marginBottom: 8,
    },
    hint: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
    btn: { backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
    // white on the solid rose button — intentional
    btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    disabled: { opacity: 0.5 },
    error: { color: theme.error, fontSize: 13, textAlign: 'center' },
  })
