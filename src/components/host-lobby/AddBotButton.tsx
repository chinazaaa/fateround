'use client'

/**
 * Bots-in-room — host lobby "+ Add bot" chip.
 *
 * Renders only while there is at least one open seat AND the (max_players - 1)
 * bot cap isn't hit. Both checks mirror the server-side gate in
 * `/api/games/[code]/bots` — if you can't see the button, the POST would have
 * rejected anyway; the button is the honest visual of the same rule.
 *
 * On success the parent's `onAdded` refetches the roster so the new bot
 * appears in the seat list.
 */

import { useState, useCallback } from 'react'

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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seatsAvailable = seatedCount < maxPlayers
  const botsUnderCap = botCount < maxPlayers - 1

  const handleClick = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/games/${gameCode}/bots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Could not add a bot')
        return
      }
      onAdded()
    } catch {
      setError('Network error — try again')
    } finally {
      setBusy(false)
    }
  }, [busy, gameCode, hostToken, onAdded])

  // Never render when a bot can't be added anyway — keeps the lobby quiet.
  if (!seatsAvailable) return null
  if (!botsUnderCap) return null

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <span aria-hidden>🤖</span>
        <span>{busy ? 'Adding bot…' : 'Add a bot to fill the room'}</span>
      </button>
      {/* Below-button caption explains WHY someone would click this — the
          feature's whole reason is "you're short players." Written once at
          the button rather than in every game landing / lobby help. */}
      <p className="text-faint text-xs text-center leading-relaxed">
        A computer opponent takes an empty seat. Ceded to any human who joins later.
      </p>
      {error ? <p className="text-red-400 text-xs text-center">{error}</p> : null}
    </div>
  )
}
