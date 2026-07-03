'use client'

import { useEffect, useState } from 'react'

// Short encouraging note shown on a game's join screen (next to the name input).
// It reassures players that winning lands them on the community leaderboard, and
// nudges returning players to reuse the EXACT same name so their wins accumulate
// under one entry instead of splitting across near-duplicate names.
//
// Self-gating: it only renders when this game type is actually tracked on the
// leaderboard (admin-curated), so it never promises a spot for an untracked game.
// Uses the same eligibility endpoint the end-screen auto-post relies on.
export function LeaderboardJoinNote({ gameType }: { gameType: string }) {
  const [eligible, setEligible] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/community/post-win?gameType=${encodeURIComponent(gameType)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setEligible(Boolean(d.eligible))
      })
      .catch(() => {
        if (!cancelled) setEligible(false)
      })
    return () => {
      cancelled = true
    }
  }, [gameType])

  if (!eligible) return null

  return (
    <div className="glass-card p-3 text-xs leading-relaxed text-muted">
      🏆 Win and you’ll be added to the community leaderboard. Already on it? Enter the{' '}
      <strong className="text-body font-semibold">exact same name</strong> so your wins add up and you keep climbing.
    </div>
  )
}
