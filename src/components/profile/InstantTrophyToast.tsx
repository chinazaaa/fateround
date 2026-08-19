'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getPlayerSession } from '@/lib/utils'
import { Glyph } from '@/components/icons/Glyph'
import { ChampionIcon, CrownIcon, StarIcon } from '@hugeicons/core-free-icons'

const TIER_ICONS = {
  bronze: StarIcon,
  silver: StarIcon,
  gold: CrownIcon,
  platinum: ChampionIcon,
}

const DISMISS_MS = 5000

type Toast = { id: string; title: string; tier: string }

let channelSeq = 0

export function InstantTrophyToast({ gameCode }: { gameCode: string | null }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seen = useRef(new Set<string>())

  useEffect(() => {
    if (!gameCode) return
    const myPlayerId = getPlayerSession(gameCode)?.playerId
    if (!myPlayerId) return

    seen.current = new Set()

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
      {toasts.map((t) => {
        const IconComponent = TIER_ICONS[t.tier as keyof typeof TIER_ICONS] ?? ChampionIcon
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-strong)] p-3.5 shadow-xl backdrop-blur-md"
          >
            <span className="fr-glyph text-[var(--primary)]">
              <Glyph icon={IconComponent} size={24} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">Trophy unlocked</p>
              <p className="truncate font-bold text-sm" style={{ color: 'var(--text)' }}>
                {t.title}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
