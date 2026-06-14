import Link from 'next/link'
import { FateRoundLogo } from '@/components/FateRoundLogo'

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
    <>
      <header className="fixed top-0 inset-x-0 z-40 flex items-center px-4 py-3 pointer-events-none">
        <Link href="/" className="pointer-events-auto">
          <FateRoundLogo className="h-8 w-auto max-w-[9.5rem] sm:max-w-[11rem]" />
        </Link>
      </header>

      <div className="page-wrap min-h-dvh flex flex-col items-center justify-center px-4 pt-14 pb-8">
        <div className="relative z-10 w-full max-w-sm text-center space-y-5">
          <p className="text-6xl" aria-hidden>
            🤷
          </p>
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title-subtle">{title}</h1>
            <p className="text-muted text-sm leading-relaxed">{message}</p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
            <Link href="/" className="btn-primary w-full sm:w-auto sm:min-w-[10rem]">
              Back home
            </Link>
            <Link href="/create" className="btn-secondary w-full sm:w-auto sm:min-w-[10rem]">
              Create a game
            </Link>
          </div>

          {showJoinHint && (
            <p className="text-faint text-xs">
              Have a room code? Enter it on the{' '}
              <Link href="/" className="text-[var(--primary)] hover:opacity-80 transition-opacity">
                homepage
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </>
  )
}
