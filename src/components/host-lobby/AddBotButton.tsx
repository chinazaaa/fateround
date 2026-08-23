'use client'

/**
 * Bots-in-room — host lobby "+ Add bot" chip, with the Phase 3 coin gate.
 *
 * First bot in a room is free (matches the plan §"Inline (contextual)"
 * decision). Every subsequent bot costs 50 coins per bot per room —
 * flat across every game type. Guests get the free-first bot but cannot
 * buy extras (they have no balance).
 *
 * The POST body carries the price the client believes the button showed
 * so the server can reject a stale client with a mismatched price. The
 * server is source of truth on both the bot count AND the spend.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { authHeaders } from '@/lib/identity'
import { useProfile } from '@/hooks/useProfile'
import { trackEvent, GA_EVENTS } from '@/lib/analytics'
import { EXTRA_BOT_COST } from '@/lib/coins/shop-catalog'

type Props = {
  gameCode: string
  hostToken: string
  seatedCount: number
  botCount: number
  maxPlayers: number
  onAdded: () => void
}

export function AddBotButton({ gameCode, hostToken, seatedCount, botCount, maxPlayers, onAdded }: Props) {
  const { profile, refresh } = useProfile()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seatsAvailable = seatedCount < maxPlayers
  const botsUnderCap = botCount < maxPlayers - 1
  const isPaid = botCount >= 1
  const balance = Number(profile?.coins ?? 0)
  const canAfford = !isPaid || balance >= EXTRA_BOT_COST
  const guest = !profile || profile.is_anonymous
  // Match the button's own disabled predicate so an "offered" event only
  // fires when the user could actually click the button. Guests and
  // insufficient-funds hosts see the disabled button + a "why" caption;
  // firing inline_purchase_offered for them inflates the offered→confirmed
  // conversion metric with impressions no one can act on.
  const offerable = seatsAvailable && botsUnderCap && isPaid && !guest && canAfford

  // Dedupe inline_purchase_offered across botCount transitions in the same
  // lobby. Reviewer round 3 finding #6: successful "add bot" refetches the
  // roster, botCount ticks up, offerable stays true, effect re-runs and
  // inflates the offered→confirmed conversion metric by one per add. Fire
  // exactly once per (gameCode) while offerable is true; reset when the
  // gate closes so a reopen after a full room clears it out.
  const offeredKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!offerable) {
      offeredKeyRef.current = null
      return
    }
    if (offeredKeyRef.current === gameCode) return
    offeredKeyRef.current = gameCode
    trackEvent(GA_EVENTS.inlinePurchaseOffered, {
      context: 'room_lobby_extra_bot',
      item_kind: 'extra_bot',
      item_slug: 'extra_bot',
      item_price: EXTRA_BOT_COST,
      owned: false,
    })
  }, [gameCode, offerable])

  const handleClick = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/games/${gameCode}/bots`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ hostToken, expectedPriceCoins: isPaid ? EXTRA_BOT_COST : 0 }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        charged?: number
        newBalance?: number
        expectedPriceCoins?: number
      }
      if (!res.ok) {
        // 409 price_mismatch carries the server's authoritative price so
        // the client can re-render with the right expectation. Trigger a
        // roster refetch (which will bump botCount to the correct value
        // and flip isPaid in the next render) so the next click sends
        // the correct expectedPriceCoins. Reviewer round 3 finding #1:
        // without this, a losing racer stayed stuck on "pricing changed"
        // with no way out short of a page refresh.
        if (res.status === 409 && typeof data.expectedPriceCoins === 'number') {
          setError('Bot pricing changed — refreshing…')
          onAdded()
          return
        }
        setError(data.error ?? 'Could not add a bot')
        return
      }
      if ((data.charged ?? 0) > 0) {
        trackEvent(GA_EVENTS.inlinePurchaseConfirmed, {
          context: 'room_lobby_extra_bot',
          item_kind: 'extra_bot',
          item_slug: 'extra_bot',
          item_price: data.charged,
          balance_after: data.newBalance ?? 0,
        })
        refresh()
      }
      onAdded()
    } catch {
      setError('Network error — try again')
    } finally {
      setBusy(false)
    }
  }, [busy, gameCode, hostToken, isPaid, onAdded, refresh])

  if (!seatsAvailable) return null
  if (!botsUnderCap) return null

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || (isPaid && (!canAfford || guest))}
        className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <span aria-hidden>🤖</span>
        <span>
          {busy ? 'Adding bot…' : isPaid ? `Add another bot — 🪙 ${EXTRA_BOT_COST}` : 'Add a bot to fill the room'}
        </span>
      </button>
      <p className="text-faint text-xs text-center leading-relaxed">
        {isPaid
          ? guest
            ? 'Save your profile to buy extra bots.'
            : canAfford
              ? 'Consumable per-room. Ceded to any human who joins later.'
              : `Not enough coins — ${EXTRA_BOT_COST - balance} more needed.`
          : 'A computer opponent takes an empty seat. Ceded to any human who joins later.'}
      </p>
      {error ? <p className="text-red-400 text-xs text-center">{error}</p> : null}
    </div>
  )
}
