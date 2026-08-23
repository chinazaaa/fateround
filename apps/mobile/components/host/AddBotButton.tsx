import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { apiUrl } from '@/lib/config'
import { authHeaders } from '@/lib/auth-headers'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Bots-in-room — host lobby "+ Add bot" button, with the Phase 3 coin gate
 * (RN parity of `src/components/host-lobby/AddBotButton.tsx`).
 *
 * First bot in the room is free; every subsequent bot costs
 * `EXTRA_BOT_COST` coins per bot per room (plan §"Inline (contextual)" and
 * §"Decisions" #6). Consumable per-room, no refund. The button:
 *   - attaches auth headers so the server can bill a profile;
 *   - sends `expectedPriceCoins` so a stale client racing another host tab
 *     doesn't silently over/under-charge;
 *   - recovers from a 409 price_mismatch by triggering the parent's roster
 *     refetch — the next render flips the price to the server's truth.
 */
type Props = {
  gameCode: string
  hostToken: string
  seatedCount: number
  botCount: number
  maxPlayers: number
  onAdded: () => void
}

// Same constant as `EXTRA_BOT_COST` in the web catalog. Duplicated (rather
// than imported cross-package) so the mobile bundle stays independent of
// the Next.js app tree; a change to the number bumps both files together.
const EXTRA_BOT_COST = 50

export function AddBotButton({ gameCode, hostToken, seatedCount, botCount, maxPlayers, onAdded }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seatsAvailable = seatedCount < maxPlayers
  const botsUnderCap = botCount < maxPlayers - 1
  const visible = seatsAvailable && botsUnderCap
  const isPaid = botCount >= 1

  const handlePress = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(apiUrl(`/api/games/${gameCode}/bots`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ hostToken, expectedPriceCoins: isPaid ? EXTRA_BOT_COST : 0 }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string; expectedPriceCoins?: number } | null
      if (!res.ok) {
        // 409 price_mismatch — another host tab (or the server's own recount
        // under advisory lock) has a different price than we sent. Trigger
        // the parent's refetch so the next render sees the true bot count
        // and next click sends the right expectedPriceCoins.
        if (res.status === 409 && typeof data?.expectedPriceCoins === 'number') {
          setError('Bot pricing changed — refreshing…')
          onAdded()
          return
        }
        setError(data?.error ?? 'Could not add bot')
        return
      }
      onAdded()
    } catch {
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }, [busy, gameCode, hostToken, isPaid, onAdded])

  if (!visible) return null

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={handlePress}
        disabled={busy}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      >
        <Text style={styles.btnText}>
          {busy ? 'Adding…' : isPaid ? `+ Add bot — 🪙 ${EXTRA_BOT_COST}` : '+ Add bot'}
        </Text>
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
