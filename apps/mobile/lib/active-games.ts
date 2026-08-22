import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '@/lib/config'
import { authHeaders } from '@/lib/identity'
import { getHostToken, getPlayerSession } from '@/lib/secure-session'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'

/**
 * The games this profile is currently in — mobile mirror of `src/lib/active-games.ts`.
 *
 * TWO CONSUMERS, ONE ANSWER. `ContinuePlayingStrip` renders these; the public browse preview
 * EXCLUDES them. Without a single source they fight: a public game you host appears in both —
 * once as "Continue playing · hosting" and again as a discovery card inviting you to join a
 * game you are already running.
 *
 * ── THIS DEVICE vs ELSEWHERE ─────────────────────────────────────────────────
 * The strip is a HANDOFF: it is for the game you left running on your phone, seen from your
 * laptop. On the device you are actually playing on it is noise — you are already there, and
 * the local Recent list covers it. So `games` excludes anything this device holds credentials
 * for (a player resume token, or the host token), while `codes` keeps ALL of them, because the
 * discovery feed should hide a game you are in regardless of which device you are in it from.
 *
 * The credential check is async on mobile (SecureStore), so it runs once per fetch and its
 * result is folded into state rather than recomputed on every render.
 */

export type ActiveGame = {
  code: string
  gameType: string
  title: string | null
  status: string
  role: 'host' | 'player'
}

async function heldOnThisDevice(code: string): Promise<boolean> {
  const [session, hostToken] = await Promise.all([getPlayerSession(code), getHostToken(code)])
  return !!session || !!hostToken
}

export function useActiveGames(): {
  /** Games you're in on ANOTHER device — what the continue strip renders. */
  games: ActiveGame[]
  /** Every active game's code, this device included — what discovery feeds exclude. */
  codes: Set<string>
} {
  const [all, setAll] = useState<ActiveGame[]>([])
  const [elsewhere, setElsewhere] = useState<ActiveGame[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/profile/active-games'), {
        headers: (await authHeaders()) ?? undefined,
      })
      if (!res.ok) return
      const json = (await res.json()) as { games?: ActiveGame[] }
      const games = json.games ?? []
      setAll(games)

      const held = await Promise.all(games.map((g) => heldOnThisDevice(g.code)))
      setElsewhere(games.filter((_, i) => !held[i]))
    } catch {
      // Keep the last good answer rather than briefly claiming you are in nothing.
    }
  }, [])

  // A game can start, end, or be joined on the other device while this screen sits open.
  useRefreshOnFocus(load)

  useEffect(() => {
    // Nothing else to do on mount — useRefreshOnFocus fires on first focus too.
  }, [])

  return { games: elsewhere, codes: new Set(all.map((g) => g.code.toUpperCase())) }
}
