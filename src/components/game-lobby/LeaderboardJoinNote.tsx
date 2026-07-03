'use client'

import { useEffect, useState } from 'react'

// Short encouraging note shown on a game's join screen (next to the name input).
// It reassures players that winning lands them on the community leaderboard, and
// nudges returning players to reuse the EXACT same name so their wins accumulate
// under one entry instead of splitting across near-duplicate names.
//
// Self-gating: it only renders when the game is actually tracked on the
// leaderboard (admin-curated), so it never promises a spot for an untracked game.
// Uses the same eligibility endpoint the end-screen auto-post relies on.
//
// `gameType` may be several entries — role-based games (e.g. Codewords) feed more
// than one leaderboard row, so the note shows if ANY of them is tracked.
export function LeaderboardJoinNote({ gameType }: { gameType: string | string[] }) {
  const [eligible, setEligible] = useState(false)
  const types = Array.isArray(gameType) ? gameType : [gameType]
  const typesKey = types.join(',')

  useEffect(() => {
    let cancelled = false
    Promise.all(
      types.map((t) =>
        fetch(`/api/community/post-win?gameType=${encodeURIComponent(t)}`, { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => Boolean(d.eligible))
          .catch(() => false)
      )
    ).then((results) => {
      if (!cancelled) setEligible(results.some(Boolean))
    })
    return () => {
      cancelled = true
    }
    // types is derived from typesKey; keying on the string keeps the effect stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typesKey])

  if (!eligible) return null

  return (
    <div className="glass-card p-3 text-xs leading-relaxed text-muted">
      🏆 Win and you’ll be added to the community leaderboard. Already on it? Enter the{' '}
      <strong className="text-body font-semibold">exact same name</strong> so your wins add up and you keep climbing.
    </div>
  )
}
