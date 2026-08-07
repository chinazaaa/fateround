'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SiteChrome } from '@/components/SiteChrome'
import { Glyph } from '@/components/icons/Glyph'
import { UI_ICONS } from '@/lib/game-glyphs'
import { WhatsAppChannelLink } from '@/components/WhatsAppChannelLink'

export default function TournamentLandingPage() {
  const router = useRouter()
  const [code, setCode] = useState('')

  const trimmed = code.trim().toUpperCase()

  function join() {
    if (trimmed) router.push(`/tournament/${trimmed}`)
  }

  return (
    <SiteChrome>
      <div className="fr-band fr-band--tight">
        <div className="mk-wrap">
          <div className="mb-6 space-y-2 text-center">
            <span className="fr-glyph">
              <Glyph icon={UI_ICONS.tournament} size={26} />
            </span>
            <h1
              className="fr-display m-0 text-[2.5rem] leading-[0.975] tracking-[-0.045em] sm:text-5xl"
              style={{ color: 'var(--text)' }}
            >
              Tournaments
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Host a multi-game championship for your squad, or enter a code to join.
            </p>
          </div>

          <div className="fr-card fr-card--xl mb-5 mx-auto max-w-[33rem]">
            <button
              type="button"
              onClick={() => router.push('/tournament/create')}
              className="fr-btn fr-btn--primary fr-btn--lg fr-btn--block"
            >
              Create a tournament
            </button>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--text-faint)' }}
              >
                or join
              </span>
              <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
            </div>

            <div className="fr-code-field">
              <input
                id="tournament-code"
                className="fr-input fr-input--code fr-code-field__input"
                placeholder="ENTER CODE"
                maxLength={12}
                aria-label="Tournament code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') join()
                }}
              />
              <button
                type="button"
                className="fr-code-go"
                disabled={!trimmed}
                onClick={join}
                aria-label="Join tournament"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>

          <div className="fr-card space-y-3 text-center mx-auto max-w-[33rem]">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              No code yet? Looking for people to play with?
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Join our community to get active tournament codes and connect with players anytime.
            </p>
            <WhatsAppChannelLink />
          </div>
        </div>
      </div>
    </SiteChrome>
  )
}
