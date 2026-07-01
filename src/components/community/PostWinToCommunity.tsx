'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { POST_CODE_MIN_LENGTH } from '@/lib/manager-constants'
import { DEFAULT_WHATSAPP_INVITE_URL } from '@/lib/community-constants'

// Shown on a game's end screen to the WINNER only (the caller gates on "did I
// win this game" — works for both a winning player and a host who plays).
// Lets the winner post their win to the community leaderboard using the weekly
// post code the admin shares in the WhatsApp group.
//
// Dedup is PER ROUND: `roundKey` should be a value that changes when the host
// plays again (the session row id, which is recreated each round). That way the
// button re-enables for the next round but can't be submitted twice for the same
// one. Falls back to per-game if no roundKey is given.
//
// Renders nothing unless the game maps to an active leaderboard row and a weekly
// code is configured, so it silently no-ops for games that aren't tracked.
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
  const { success, error } = useToast()
  const [eligible, setEligible] = useState(false)
  const [whatsappUrl, setWhatsappUrl] = useState(DEFAULT_WHATSAPP_INVITE_URL)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(winnerName)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [posted, setPosted] = useState(false)

  const postedKey = `community_posted_${gameCode}_${roundKey ?? 'default'}`

  // Already posted this round on this device? Show the confirmed state up front.
  useEffect(() => {
    try {
      setPosted(localStorage.getItem(postedKey) === '1')
    } catch {
      setPosted(false)
    }
  }, [postedKey])

  useEffect(() => setName(winnerName), [winnerName])

  // Check eligibility (game is on the leaderboard + weekly code is set).
  useEffect(() => {
    let cancelled = false
    fetch(`/api/community/post-win?gameType=${encodeURIComponent(gameType)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setEligible(Boolean(d.eligible) && Boolean(d.codeConfigured))
        if (d.whatsappInviteUrl) setWhatsappUrl(d.whatsappInviteUrl)
      })
      .catch(() => {
        if (!cancelled) setEligible(false)
      })
    return () => {
      cancelled = true
    }
  }, [gameType])

  const markPosted = useCallback(() => {
    setPosted(true)
    setOpen(false)
    try {
      localStorage.setItem(postedKey, '1')
    } catch {
      /* ignore */
    }
  }, [postedKey])

  const submit = async () => {
    if (!name.trim()) {
      error('Enter your name')
      return
    }
    if (code.trim().length < POST_CODE_MIN_LENGTH) {
      error(`The code is at least ${POST_CODE_MIN_LENGTH} characters`)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/community/post-win', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: name.trim(),
          code: code.trim(),
          gameId: gameCode,
          roundKey: roundKey ?? null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        // Already recorded (e.g. posted from another device) — treat as done.
        markPosted()
        success('This win is already on the leaderboard')
        return
      }
      if (!res.ok) throw new Error(data.error ?? 'Could not post your win')
      markPosted()
      success('Win posted to the community leaderboard! 🏆')
    } catch (err) {
      error(err instanceof Error ? err.message : 'Could not post your win')
    } finally {
      setSubmitting(false)
    }
  }

  if (!eligible) return null

  if (posted) {
    return (
      <div className="glass-card p-4 text-center text-sm text-[var(--marry)] font-semibold">
        ✓ Submitted to the community leaderboard
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary w-full py-3 flex items-center justify-center gap-2"
      >
        🏆 Post win to community leaderboard
      </button>
    )
  }

  return (
    <div className="glass-card-strong p-5 space-y-3">
      <div>
        <p className="font-bold">Post your win</p>
        <p className="text-xs text-muted mt-0.5">
          Enter this week’s community code to add this win to the leaderboard.
        </p>
      </div>
      <label className="block text-sm">
        <span className="text-muted">Your name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="input-field w-full mt-1"
          autoComplete="off"
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted">This week’s code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="e.g. Naza"
          className="input-field w-full mt-1"
          autoComplete="off"
        />
      </label>
      <p className="text-xs text-muted">
        Don’t have the code?{' '}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-emerald-600 hover:underline"
        >
          Join the community to get it →
        </a>
      </p>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-secondary btn-fit px-4 py-2.5"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="btn-primary flex-1 py-2.5 disabled:opacity-60"
        >
          {submitting ? 'Posting…' : 'Post win'}
        </button>
      </div>
    </div>
  )
}
