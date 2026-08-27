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
  error,
  reset,
}: ServerErrorPageProps) {
  // Identity of the underlying error. This page has always taken an `error` prop and never
  // rendered it, so every report of this screen arrived without the one detail that would
  // explain it — four separate attempts at the tab-resume bug were made without anyone ever
  // seeing what actually threw.
  //
  // This runs in production, in front of customers, so the raw text is NOT on display: a
  // player sees only a short reference code, which reads as a support code rather than a
  // crash. The raw message sits behind a collapsed toggle — one tap for anyone debugging or
  // quoting it to support, invisible to everyone else. Truncated so a long stack can't run
  // away with the layout.
  const reference = error?.digest || shortHash(error?.message)
  const rawMessage = error?.message ? truncate(error.message, 300) : null
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

            {reference ? (
              <div className="pt-2 space-y-2">
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                  Reference <span className="font-mono select-all">{reference}</span>
                </p>
                {rawMessage ? (
                  <details className="text-left">
                    <summary
                      className="text-xs cursor-pointer text-center list-none"
                      style={{ color: 'var(--text-faint)' }}
                    >
                      Technical details
                    </summary>
                    <p
                      className="mt-2 text-xs font-mono break-words select-all max-h-40 overflow-y-auto rounded-md p-2"
                      style={{
                        color: 'var(--text-muted)',
                        background: 'color-mix(in srgb, var(--text-faint) 10%, transparent)',
                      }}
                    >
                      {rawMessage}
                    </p>
                  </details>
                ) : null}
              </div>
            ) : null}

            <p className="text-xs pt-2" style={{ color: 'var(--text-faint)' }}>
              If this issue persists, contact us at{' '}
              <a
                href="mailto:support@fateround.com"
                className="font-semibold text-[var(--primary)] hover:underline no-underline transition-colors"
              >
                support@fateround.com
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </SiteChrome>
  )
}

/** Trim to `max` characters so a long stack or a giant message can't blow out the card. */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

/** Short, stable reference for an error with no Next.js digest (client-side throws don't get
 *  one). Same message → same code, so repeat reports of one bug are recognisably the same. */
function shortHash(text: string | undefined): string | null {
  if (!text) return null
  let h = 0
  for (let i = 0; i < text.length; i += 1) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36).padStart(6, '0').slice(0, 6)
}
