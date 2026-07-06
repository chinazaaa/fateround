'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Field, PrimaryBtn } from '@/components/ui/PageShell'
import { SiteChrome } from '@/components/SiteChrome'
import { DEFAULT_WHATSAPP_INVITE_URL } from '@/lib/community-constants'

export default function TournamentLandingPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  // Community invite link — admin-configured (same link the leaderboard uses),
  // with the default as a fallback so the prompt always works.
  const [communityUrl, setCommunityUrl] = useState(DEFAULT_WHATSAPP_INVITE_URL)

  useEffect(() => {
    let cancelled = false
    fetch('/api/community/link', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.whatsappInviteUrl) setCommunityUrl(d.whatsappInviteUrl)
      })
      .catch(() => {
        /* keep the default */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const trimmed = code.trim().toUpperCase()

  function join() {
    if (trimmed) router.push(`/tournament/${trimmed}`)
  }

  return (
    <SiteChrome>
      <PageShell narrow>
      <div className="text-center space-y-2">
        <span className="premium-badge">Tournament</span>
        <h1 className="text-4xl font-black gradient-title leading-tight">Tournaments</h1>
        <p className="text-muted text-sm">Run a multi-game competition for your group — or join one with a code.</p>
      </div>

      <div className="glass-card-strong p-5 sm:p-6 space-y-5">
        <PrimaryBtn onClick={() => router.push('/tournament/create')} className="w-full">
          Create a tournament
        </PrimaryBtn>

        <div className="flex items-center gap-3">
          <div className="flex-1 divider-soft" />
          <span className="label-caps text-faint">or join</span>
          <div className="flex-1 divider-soft" />
        </div>

        <Field label="Tournament code" htmlFor="tournament-code">
          <div className="flex gap-2">
            <input
              id="tournament-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') join()
              }}
              placeholder="Enter code"
              maxLength={12}
              autoCapitalize="characters"
              className="input-field flex-1 uppercase tracking-wider"
            />
            <button
              type="button"
              onClick={join}
              disabled={!trimmed}
              className="btn-secondary btn-fit disabled:opacity-40"
            >
              Join
            </button>
          </div>
        </Field>
      </div>

      <div className="glass-card p-5 text-center space-y-2.5">
        <p className="text-sm font-semibold text-body">Got no code? Not sure when the next game is?</p>
        <p className="text-xs text-muted">
          Join our community to get tournament codes and find out when the next game goes live.
        </p>
        <a
          href={communityUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/25"
        >
          💬 Join our community
        </a>
      </div>
      </PageShell>
    </SiteChrome>
  )
}
