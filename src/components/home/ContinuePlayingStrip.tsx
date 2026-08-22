'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { authHeaders } from '@/lib/identity'
import { GAME_TYPE_CONFIG } from '@/lib/game-types'
import type { GameType } from '@/types'

/**
 * "Continue playing" — the games you're in the middle of, started on ANY device.
 *
 * WHY. Everything that remembers a game today is LOCAL to the device that played it: the
 * mobile recent list reads SecureStore, web's reads localStorage. So a game started on a phone
 * is invisible on a laptop even when both are signed into the same account, and the only way
 * across was to retype the code. This is the cross-device half — you see it wherever you are.
 *
 * Tapping resumes HERE, and where that goes depends on the role the server reports: a host
 * lands on `/host/<code>`, which takes the host token back via `/reclaim-host`; a player lands
 * on `/game/<code>`, which continues their seat. Both paths already existed; this makes them
 * findable without retyping a code.
 *
 * Renders nothing for a signed-out visitor or when nothing is live — an empty "Continue
 * playing" heading is worse than no heading, and this sits above the fold.
 */

type ActiveGame = {
  code: string
  gameType: string
  title: string | null
  status: string
  role: 'host' | 'player'
}

export function ContinuePlayingStrip() {
  const [games, setGames] = useState<ActiveGame[]>([])

  const load = useCallback(async () => {
    try {
      const auth = await authHeaders()
      // No bearer means no cross-device identity to look up; the local recent list is already
      // the right answer for a guest.
      if (!auth?.Authorization) return
      const res = await fetch('/api/profile/active-games', { headers: auth, cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as { games?: ActiveGame[] }
      setGames(json.games ?? [])
    } catch {
      // Keep whatever is on screen — a failed poll must never blank a list of live games.
    }
  }, [])

  useEffect(() => {
    void load()
    // A game can start or end on the other device while this tab sits open.
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  if (games.length === 0) return null

  return (
    <section className="space-y-2">
      <h2 className="label-caps text-xs">Continue playing</h2>
      <ul className="glass-card divide-y divide-[var(--border)] !p-0">
        {games.map((game) => {
          const cfg = GAME_TYPE_CONFIG[game.gameType as GameType]
          return (
            <li key={game.code}>
              <Link
                href={game.role === 'host' ? `/host/${game.code}` : `/game/${game.code}`}
                className="flex items-center gap-3 px-4 py-3 no-underline"
              >
                <span className="text-xl" aria-hidden>
                  {cfg?.card?.emoji ?? '🎮'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-body block truncate text-sm font-bold">{game.title?.trim() || game.code}</span>
                  <span className="text-muted block truncate text-xs">
                    {cfg?.label ?? game.gameType} · {game.status === 'waiting' ? 'In the lobby' : 'In progress'}
                    {game.role === 'host' ? ' · hosting' : ''}
                  </span>
                </span>
                <span className="text-faint shrink-0" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
