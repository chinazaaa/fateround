import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { apiUrl } from '@/lib/config'
import { authHeaders } from '@/lib/auth-headers'
import { authHeaders as identityAuthHeaders } from '@/lib/identity'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { EXTRA_BOT_COST } from '@/lib/coins/shop-catalog'
import { COIN_EVENTS, trackCoinEvent } from '@/lib/coins/analytics'
import { onCoinsAwarded } from '@/lib/coins/earn-events'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'

/**
 * Bots-in-room — host lobby "+ Add bot" button, with the Phase 3 coin gate
 * (RN parity of `src/components/host-lobby/AddBotButton.tsx`).
 *
 * First bot in the room is free; every subsequent bot costs
 * `EXTRA_BOT_COST` coins per bot per room. The button:
 *   - attaches auth headers so the server can bill a profile;
 *   - sends `expectedPriceCoins` so a stale client racing another host tab
 *     doesn't silently over/under-charge;
 *   - fetches the caller's coin balance + guest state so the caption
 *     surfaces "X more needed" (rather than a raw server error) before the
 *     tap even happens — the web parity the plan calls for;
 *   - fires `inline_purchase_offered` / `inline_purchase_confirmed` in
 *     lockstep with web so the offered→confirmed funnel matches.
 */
type Props = {
  gameCode: string
  hostToken: string
  seatedCount: number
  botCount: number
  maxPlayers: number
  onAdded: () => void
}

export function AddBotButton({ gameCode, hostToken, seatedCount, botCount, maxPlayers, onAdded }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState<number>(0)
  // `null` until the first /api/profile/me resolves — treat unknown as
  // still-loading rather than defaulting to guest=true, which would
  // otherwise flash a signed-in host the guest gate ("Save your profile
  // to buy extra bots") and disable the button until the round-trip
  // completes. Under the unknown state the paid caption reads a neutral
  // "Checking your balance…" and the button is disabled — a spurious
  // enable on a stale-guest fetch is worse than a brief wait.
  const [guest, setGuest] = useState<boolean | null>(null)

  const seatsAvailable = seatedCount < maxPlayers
  const botsUnderCap = botCount < maxPlayers - 1
  const visible = seatsAvailable && botsUnderCap
  const isPaid = botCount >= 1
  const canAfford = !isPaid || balance >= EXTRA_BOT_COST
  const identityKnown = guest !== null
  const offerable = visible && isPaid && guest === false && canAfford
  const disabled = busy || (isPaid && (!identityKnown || !canAfford || guest === true))

  // Load profile so the caption knows guest / balance without waiting for a
  // failed POST. Mobile has no shared useProfile hook — inline this cheap
  // GET the same way CoinChip does.
  const refresh = useCallback(async () => {
    try {
      const headers = await identityAuthHeaders()
      if (!headers) {
        setGuest(true)
        setBalance(0)
        return
      }
      const res = await fetch(apiUrl('/api/profile/me'), { headers })
      if (!res.ok) return
      const data = await res.json()
      const profile = data?.profile
      if (!profile) {
        setGuest(true)
        setBalance(0)
        return
      }
      setGuest(Boolean(profile.is_anonymous))
      setBalance(Number(profile.coins ?? 0))
    } catch {
      // silent — the button still works via the server error path.
    }
  }, [])

  useEffect(() => {
    void refresh()
    return onCoinsAwarded(() => void refresh())
  }, [refresh])

  useRefreshOnFocus(refresh)

  // Dedupe `inline_purchase_offered` per gameCode transition — matches
  // the web ref-guard so a successful add doesn't re-fire offered when
  // botCount ticks up but offerable stays true.
  const offeredKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!offerable) {
      offeredKeyRef.current = null
      return
    }
    if (offeredKeyRef.current === gameCode) return
    offeredKeyRef.current = gameCode
    trackCoinEvent(COIN_EVENTS.inlinePurchaseOffered, {
      context: 'room_lobby_extra_bot',
      item_kind: 'extra_bot',
      item_slug: 'extra_bot',
      item_price: EXTRA_BOT_COST,
      owned: false,
    })
  }, [gameCode, offerable])

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
      const data = (await res.json().catch(() => null)) as {
        error?: string
        expectedPriceCoins?: number
        charged?: number
        newBalance?: number
      } | null
      if (!res.ok) {
        if (res.status === 409 && typeof data?.expectedPriceCoins === 'number') {
          setError('Bot pricing changed — refreshing…')
          onAdded()
          return
        }
        setError(data?.error ?? 'Could not add bot')
        return
      }
      if ((data?.charged ?? 0) > 0) {
        // Match web: only record balance_after when we actually know it —
        // a `?? 0` fallback would misreport as broke.
        trackCoinEvent(COIN_EVENTS.inlinePurchaseConfirmed, {
          context: 'room_lobby_extra_bot',
          item_kind: 'extra_bot',
          item_slug: 'extra_bot',
          item_price: data?.charged,
          ...(typeof data?.newBalance === 'number' ? { balance_after: data.newBalance } : {}),
        })
        void refresh()
      }
      onAdded()
    } catch {
      setError('Network error — try again')
    } finally {
      setBusy(false)
    }
  }, [busy, gameCode, hostToken, isPaid, onAdded, refresh])

  if (!visible) return null

  const caption = isPaid
    ? !identityKnown
      ? 'Checking your balance…'
      : guest
        ? 'Save your profile to buy extra bots.'
        : canAfford
          ? 'Consumable per-room. Ceded to any human who joins later.'
          : `Not enough coins — ${EXTRA_BOT_COST - balance} more needed.`
    : 'A computer opponent takes an empty seat. Ceded to any human who joins later.'

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, disabled && styles.disabled]}
      >
        <Text style={styles.btnText}>
          {busy ? 'Adding bot…' : isPaid ? `+ Add another bot — 🪙 ${EXTRA_BOT_COST}` : '+ Add a bot to fill the room'}
        </Text>
      </Pressable>
      <Text style={styles.caption}>{caption}</Text>
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
    disabled: { opacity: 0.5 },
    btnText: { color: theme.text, fontSize: 14, fontWeight: '700' },
    caption: { color: theme.textFaint, fontSize: 11, textAlign: 'center', lineHeight: 15 },
    error: { color: theme.error, fontSize: 12, textAlign: 'center' },
  })
