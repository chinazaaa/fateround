'use client'

import Link from 'next/link'
import { SiteChrome } from '@/components/SiteChrome'
import { Glyph } from '@/components/icons/Glyph'
import { Alert02Icon, RefreshIcon } from '@hugeicons/core-free-icons'

type ServerErrorPageProps = {
  title?: string
  message?: string
  error?: Error & { digest?: string }
  reset?: () => void
}

export function ServerErrorPage({
  title = "Can't reach server",
  message = "We're having trouble connecting to the server. Check your internet connection or try refreshing.",
  reset,
}: ServerErrorPageProps) {
  return (
    <SiteChrome>
      <div className="fr-band fr-band--tight flex-1 flex items-center justify-center min-h-[70vh]">
        <div className="mk-wrap">
          <div className="mx-auto max-w-md text-center space-y-6">
            <div className="flex justify-center">
              <span className="fr-glyph text-rose-500 p-4 rounded-full bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
                <Glyph icon={Alert02Icon} size={42} />
              </span>
            </div>

            <div className="space-y-2">
              <h1
                className="fr-display m-0 text-3xl sm:text-4xl font-extrabold tracking-tight"
                style={{ color: 'var(--text)' }}
              >
                {title}
              </h1>
              <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
                {message}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              {reset ? (
                <button
                  type="button"
                  onClick={() => reset()}
                  className="fr-btn fr-btn--primary w-full sm:w-auto min-w-[10rem] cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  <Glyph icon={RefreshIcon} size={16} />
                  Try again
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="fr-btn fr-btn--primary w-full sm:w-auto min-w-[10rem] cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  <Glyph icon={RefreshIcon} size={16} />
                  Reload page
                </button>
              )}
              <Link href="/" className="fr-btn fr-btn--secondary w-full sm:w-auto min-w-[10rem]">
                Back home
              </Link>
            </div>

            <p className="text-xs pt-2" style={{ color: 'var(--text-faint)' }}>
              If this issue persists, check our{' '}
              <Link
                href="/updates"
                className="font-semibold text-[var(--primary)] hover:underline no-underline transition-colors"
              >
                status &amp; updates page
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </SiteChrome>
  )
}
