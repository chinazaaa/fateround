'use client'

import { useEffect, useRef, useState } from 'react'

// Shown on a game's end screen to the WINNER only (the caller gates on "did I
// win this game" — works for both a winning player and a host who plays).
// Automatically posts the winner to the community leaderboard: no code, no
// button — reaching the win screen puts you on the board.
//
// It posts DIRECTLY rather than gating on a separate eligibility check first: the
// POST itself is the source of truth (a 404 means the game isn't tracked), and
// firing it straight away means the win still records even if this screen unmounts
// a moment later — which is common on race/quiz games where live updates can flip
// the view right after it finishes. Waiting on a prior GET was silently dropping
// those wins.
//
// Dedup is PER ROUND: `roundKey` should be a value that changes when the host
// plays again (the session row id, which is recreated each round). That way the
// win posts once per round, and a fresh round posts again. The server also dedups.
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
  // 'idle' = posting or not yet resolved; 'untracked' = game isn't on the board.
  const [status, setStatus] = useState<'idle' | 'posted' | 'error' | 'untracked'>('idle')
  // Bumped by the Retry button to re-run the auto-post effect.
  const [retry, setRetry] = useState(0)

  const postedKey = `community_posted_${gameCode}_${roundKey ?? 'default'}`
  // Guards against double-posting from a re-render/StrictMode within one mount;
  // localStorage guards across reloads; the server dedups as the backstop.
  const attemptedRef = useRef(false)

  // Already posted this round on this device? Show the confirmed state up front.
  useEffect(() => {
    try {
      if (localStorage.getItem(postedKey) === '1') setStatus('posted')
    } catch {
      /* ignore */
    }
  }, [postedKey])

  // Auto-post the win as soon as we have a winner name.
  useEffect(() => {
    if (!winnerName.trim()) return
    if (attemptedRef.current) return
    // Already posted this round on this device — confirm and skip re-posting.
    try {
      if (localStorage.getItem(postedKey) === '1') {
        setStatus('posted')
        return
      }
    } catch {
      /* ignore */
    }
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
      .then((res) => {
        if (cancelled) return
        // 409 = already recorded (e.g. posted from another device) — treat as done.
        if (res.ok || res.status === 409) {
          markPosted()
          return
        }
        // 404 = this game isn't on the community leaderboard — silently render nothing.
        if (res.status === 404) {
          setStatus('untracked')
          return
        }
        setStatus('error')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [winnerName, retry, postedKey, gameCode, roundKey, gameType])

  // Nothing to show without a winner, or when the game isn't tracked.
  if (!winnerName.trim() || status === 'untracked') return null

  if (status === 'error') {
    return (
      <div className="glass-card p-4 text-center text-sm text-muted">
        Couldn’t add this win to the community leaderboard.{' '}
        <button
          type="button"
          onClick={() => {
            attemptedRef.current = false
            setStatus('idle')
            setRetry((n) => n + 1)
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

  // idle / posting — render nothing until the post resolves, so games that aren't
  // tracked never flash a message.
  return null
}
