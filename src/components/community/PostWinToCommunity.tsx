'use client'

import { useEffect, useRef, useState } from 'react'

// Shown on a game's end screen to the WINNER only (the caller gates on "did I
// win this game" — works for both a winning player and a host who plays).
// Automatically posts the winner to the community leaderboard: no code, no
// button — reaching the win screen puts you on the board.
//
// Dedup is PER ROUND: `roundKey` should be a value that changes when the host
// plays again (the session row id, which is recreated each round). That way the
// win posts once per round, and a fresh round posts again.
//
// Renders nothing unless the game maps to an active leaderboard row, so it
// silently no-ops for games that aren't tracked.
//
// `gameType` is the leaderboard entry to post to. For normal games it's the real
// game type (e.g. "whot"); for role-based awards it's an achievement key (e.g.
// "codewords_spymaster"). The server independently derives the game actually
// played from `gameCode` and rejects a mismatch, so this can't be spoofed.
export function PostWinToCommunity({
  gameType,
  gameCode,
  winnerName,
  roundKey,
}: {
  gameType: string
  gameCode: string
  winnerName: string
  roundKey?: string | null
}) {
  const [eligible, setEligible] = useState(false)
  const [status, setStatus] = useState<'idle' | 'posting' | 'posted' | 'error'>('idle')

  const postedKey = `community_posted_${gameCode}_${roundKey ?? 'default'}`
  // Guards against double-posting from a re-render/StrictMode within one mount;
  // localStorage guards across reloads.
  const attemptedRef = useRef(false)

  // Already posted this round on this device? Show the confirmed state up front.
  useEffect(() => {
    try {
      if (localStorage.getItem(postedKey) === '1') setStatus('posted')
    } catch {
      /* ignore */
    }
  }, [postedKey])

  // Check eligibility (game is on the leaderboard).
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

  // Auto-post the win once we know the game is tracked and we have a winner name.
  useEffect(() => {
    if (!eligible) return
    if (!winnerName.trim()) return
    if (status === 'posted') return
    if (attemptedRef.current) return
    attemptedRef.current = true

    let cancelled = false
    const markPosted = () => {
      if (cancelled) return
      setStatus('posted')
      try {
        localStorage.setItem(postedKey, '1')
      } catch {
        /* ignore */
      }
    }

    setStatus('posting')
    fetch('/api/community/post-win', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName: winnerName.trim(),
        gameId: gameCode,
        roundKey: roundKey ?? null,
        leaderboardType: gameType,
      }),
    })
      .then(async (res) => {
        // 409 = already recorded (e.g. posted from another device) — treat as done.
        if (res.ok || res.status === 409) {
          markPosted()
          return
        }
        if (!cancelled) setStatus('error')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, winnerName, status])

  // Nothing to show until we've confirmed the game is tracked and there's a
  // winner to post. Callers already gate on "did I win", but this guarantees we
  // never post a blank win even if a call site slips.
  if (!eligible || !winnerName.trim()) return null

  if (status === 'error') {
    return (
      <div className="glass-card p-4 text-center text-sm text-muted">
        Couldn’t add this win to the community leaderboard.{' '}
        <button
          type="button"
          onClick={() => {
            attemptedRef.current = false
            setStatus('idle')
          }}
          className="font-semibold text-emerald-600 hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  if (status === 'posted') {
    return (
      <div className="glass-card p-4 text-center text-sm text-[var(--marry)] font-semibold">
        ✓ Added to the community leaderboard 🏆
      </div>
    )
  }

  // idle / posting
  return (
    <div className="glass-card p-4 text-center text-sm text-muted">Adding your win to the community leaderboard…</div>
  )
}
