import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { apiUrl } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Bots-in-room — host lobby "+ Add bot" button.
 *
 * RN parity of the web `AddBotButton` in `src/components/host-lobby/`.
 * Only renders while there's an open seat AND the (max_players - 1) bot
 * cap isn't hit — mirrors the server-side gate in `/api/games/[code]/bots`
 * so the button is the honest visual of the same rule.
 *
 * On success the parent's `onAdded` refetches the roster so the new bot
 * appears within a tick.
 */
type Props = {
  gameCode: string
  hostToken: string
  /** All non-spectator players (humans + existing bots). Used to decide visibility. */
  seatedCount: number
  botCount: number
  /** Effective max_players for this game type + host setting. */
  maxPlayers: number
  /** Called after a successful add so the parent can refetch. */
  onAdded: () => void
}

export function AddBotButton({ gameCode, hostToken, seatedCount, botCount, maxPlayers, onAdded }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seatsAvailable = seatedCount < maxPlayers
  const botsUnderCap = botCount < maxPlayers - 1
  const visible = seatsAvailable && botsUnderCap

  const handlePress = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(apiUrl(`/api/games/${gameCode}/bots`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Could not add bot')
        return
      }
      onAdded()
    } catch {
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }, [busy, gameCode, hostToken, onAdded])

  if (!visible) return null

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={handlePress}
        disabled={busy}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      >
        <Text style={styles.btnText}>{busy ? 'Adding…' : '+ Add bot'}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.xs, marginTop: theme.space.sm },
    btn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.md,
      paddingVertical: theme.space.sm,
      paddingHorizontal: theme.space.md,
      alignItems: 'center',
      backgroundColor: theme.surface,
    },
    btnPressed: { opacity: 0.7 },
    btnText: { color: theme.text, fontSize: 14, fontWeight: '700' },
    error: { color: theme.error, fontSize: 12, textAlign: 'center' },
  })
