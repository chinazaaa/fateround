'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getPlayerSession } from '@/lib/utils'

const TIER_EMOJI: Record<string, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  platinum: '🏆',
}

/** How long a toast stays before it retires itself. */
const DISMISS_MS = 5000

type Toast = { id: string; title: string; tier: string }

let channelSeq = 0

/**
 * The console-style pop when you unlock something mid-game
 * (`docs/trophy-unlocks-plan.md` §2).
 *
 * Mid-round unlocks are written to `round_unlocks` by the SERVER, from the action handler that
 * saw the moment. This listens for the player's own rows over realtime and shows them. Nothing
 * here decides whether a trophy was earned — the client is a display, and an unlock a client
 * could claim would be a free trophy for anyone with devtools.
 *
 * WHY IT FILTERS BY PLAYER. The subscription is per game, so every client in the room sees every
 * unlock row. Showing someone else's would be a different feature (and needs a rarity/privacy
 * decision first), so anything that isn't this device's seat is dropped.
 *
 * WHY THE TOP. Same reasoning as `PostWinPrompt`: the bottom corner is where people have learned
 * nothing important lives, and this is a reward. `top-16` clears the fixed game header and z-50
 * puts it above that header's z-40.
 */
export function InstantTrophyToast({ gameCode }: { gameCode: string | null }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  // Survives remounts within a round so a re-subscribe can't replay a toast already shown.
  const seen = useRef(new Set<string>())

  useEffect(() => {
    if (!gameCode) return
    const myPlayerId = getPlayerSession(gameCode)?.playerId
    if (!myPlayerId) return

    const channel = supabase
      .channel(`unlocks-${gameCode}-${++channelSeq}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'round_unlocks', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const row = payload.new as { player_id?: string; trophy_id?: string }
          if (row.player_id !== myPlayerId || !row.trophy_id) return
          if (seen.current.has(row.trophy_id)) return
          seen.current.add(row.trophy_id)
          void showTrophy(row.trophy_id)
        }
      )
      .subscribe()

    // The row carries only an id — title and tier come from the public catalog, which is the
    // same source the landing pages read, so a hidden trophy stays masked here too.
    const showTrophy = async (trophyId: string) => {
      const res = await fetch(`/api/trophies/${encodeURIComponent(trophyId)}`).catch(() => null)
      if (!res?.ok) return
      const json = (await res.json().catch(() => null)) as { title?: string; tier?: string } | null
      if (!json?.title) return
      const toast: Toast = { id: trophyId, title: json.title, tier: json.tier ?? 'bronze' }
      setToasts((current) => [...current, toast])
      setTimeout(() => setToasts((current) => current.filter((t) => t.id !== toast.id)), DISMISS_MS)
    }

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode])

  if (!toasts.length) return null

  return (
    <div className="pointer-events-none fixed inset-x-4 top-16 z-50 mx-auto flex max-w-sm flex-col gap-2 sm:left-auto sm:right-4 sm:mx-0">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-strong)] p-3 shadow-lg backdrop-blur-md"
        >
          <span className="text-2xl" aria-hidden>
            {TIER_EMOJI[t.tier] ?? '🏅'}
          </span>
          <div className="min-w-0">
            <p className="text-faint text-xs uppercase tracking-wide">Trophy unlocked</p>
            <p className="truncate font-bold">{t.title}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
