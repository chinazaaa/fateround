import Link from 'next/link'
import { SiteChrome } from '@/components/SiteChrome'
import { Glyph } from '@/components/icons/Glyph'
import { Search01Icon } from '@hugeicons/core-free-icons'

type NotFoundPageProps = {
  title?: string
  message?: string
  showJoinHint?: boolean
}

export function NotFoundPage({
  title = 'Page not found',
  message = "That link doesn't go anywhere. Double-check the URL or head back home.",
  showJoinHint = true,
}: NotFoundPageProps) {
  return (
    <SiteChrome>
      <div className="fr-band fr-band--tight flex-1 flex items-center justify-center min-h-[70vh]">
        <div className="mk-wrap">
          <div className="mx-auto max-w-md text-center space-y-6">
            <div className="flex justify-center">
              <span className="fr-glyph text-[var(--primary)] p-4 rounded-full bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
                <Glyph icon={Search01Icon} size={42} />
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
              <Link href="/" className="fr-btn fr-btn--primary w-full sm:w-auto min-w-[10rem]">
                Back home
              </Link>
              <Link href="/create" className="fr-btn fr-btn--secondary w-full sm:w-auto min-w-[10rem]">
                Create a game
              </Link>
            </div>

            {showJoinHint && (
              <p className="text-xs pt-2" style={{ color: 'var(--text-faint)' }}>
                Have a room code? Enter it on the{' '}
                <Link
                  href="/"
                  className="font-semibold text-[var(--primary)] hover:underline no-underline transition-colors"
                >
                  homepage
                </Link>
                .
              </p>
            )}
          </div>
        </div>
      </div>
    </SiteChrome>
  )
}
