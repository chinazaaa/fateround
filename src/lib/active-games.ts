'use client'

import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/identity'
import { getPlayerSession } from '@/lib/utils'
import { readHostToken } from '@/lib/host-session'

/**
 * The games this profile is currently in, shared by every surface that cares.
 *
 * TWO CONSUMERS, ONE ANSWER. `ContinuePlayingStrip` renders these; the public "Live games"
 * feed EXCLUDES them. Without a single source they fight: a public game you host appears in
 * both — once as "Continue playing · hosting" and again as a discovery card inviting you to
 * join a game you are already running. The division only reads cleanly if it is exact, so both
 * sides have to be looking at the same list.
 *
 * `LiveGamesStrip` already flipped its CTA to "Continue" for games this BROWSER had a session
 * for, which covered the player case on one device and missed the host-only case entirely.
 * This replaces that guesswork with the profile-level truth.
 *
 * ── THIS DEVICE vs ELSEWHERE ─────────────────────────────────────────────────
 * The strip is a HANDOFF: it is for the game you left running on your phone, seen from your
 * laptop. On the device you are actually playing on it is noise — you are already there, and
 * the local Recent list covers it. So `games` excludes anything this device holds credentials
 * for (a player resume token, or the host token), while `codes` keeps ALL of them, because the
 * discovery feed should hide a game you are in regardless of which device you are in it from.
 *
 * The request is shared and cached briefly, so two components mounting together cost one call.
 */

export type ActiveGame = {
  code: string
  gameType: string
  title: string | null
  status: string
  role: 'host' | 'player'
}

/** Long enough that sibling mounts share a call; short enough that a finished game clears. */
const TTL_MS = 10_000

let cache: { at: number; games: ActiveGame[] } | null = null
let inFlight: Promise<ActiveGame[]> | null = null
const subscribers = new Set<(games: ActiveGame[]) => void>()

async function load(force = false): Promise<ActiveGame[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.games
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const auth = await authHeaders()
      // A guest has no cross-device identity to look up. Empty, not an error — the local
      // recent list is already the right answer for them.
      if (!auth?.Authorization) return []
      const res = await fetch('/api/profile/active-games', { headers: auth, cache: 'no-store' })
      if (!res.ok) return cache?.games ?? []
      const json = (await res.json()) as { games?: ActiveGame[] }
      return json.games ?? []
    } catch {
      // Keep the last good answer rather than briefly claiming you are in nothing.
      return cache?.games ?? []
    } finally {
      inFlight = null
    }
  })()

  const games = await inFlight
  cache = { at: Date.now(), games }
  for (const notify of subscribers) notify(games)
  return games
}

/** True when THIS browser already holds credentials for the game — i.e. you're playing here. */
function heldOnThisDevice(code: string): boolean {
  return !!getPlayerSession(code) || !!readHostToken(code)
}

export function useActiveGames(): {
  /** Games you're in on ANOTHER device — what the continue strip renders. */
  games: ActiveGame[]
  /** Every active game's code, this device included — what discovery feeds exclude. */
  codes: Set<string>
  refresh: () => void
} {
  const [games, setGames] = useState<ActiveGame[]>(() => cache?.games ?? [])

  useEffect(() => {
    subscribers.add(setGames)
    void load()
    // A game can start or end on the other device while this tab sits open.
    const onFocus = () => void load(true)
    window.addEventListener('focus', onFocus)
    return () => {
      subscribers.delete(setGames)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const refresh = useCallback(() => void load(true), [])
  return {
    games: games.filter((g) => !heldOnThisDevice(g.code)),
    codes: new Set(games.map((g) => g.code.toUpperCase())),
    refresh,
  }
}
