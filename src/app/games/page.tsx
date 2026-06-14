import Link from 'next/link'
import type { Metadata } from 'next'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { GAME_TYPE_OPTIONS, gameTypeConfig } from '@/lib/game-types'
import { GAME_LANDING_CONTENT, gameLandingSlug } from '@/lib/game-landing'
import { SITE_NAME, OG_IMAGE } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'All Party Games',
  description:
    'Browse free online party games on Fate Round — Smash Marry Kill, Would You Rather, Most Likely To, Red Flag Green Flag, and more.',
  alternates: { canonical: '/games' },
  openGraph: {
    title: `All Party Games | ${SITE_NAME}`,
    description:
      'Browse free online party games on Fate Round — Smash Marry Kill, Would You Rather, Most Likely To, Red Flag Green Flag, and more.',
    url: '/games',
    images: [OG_IMAGE],
  },
}

export default function GamesIndexPage() {
  const games = GAME_TYPE_OPTIONS.map((type) => ({
    type,
    slug: gameLandingSlug(type),
    content: GAME_LANDING_CONTENT[type],
    cfg: gameTypeConfig(type),
  }))

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-40 flex items-center px-4 py-3 pointer-events-none">
        <Link href="/" className="pointer-events-auto">
          <FateRoundLogo className="h-8 w-auto max-w-[9.5rem] sm:max-w-[11rem]" />
        </Link>
      </header>

      <div className="page-wrap min-h-dvh px-4 pt-20 pb-16">
        <div className="relative mx-auto max-w-3xl space-y-10">
          <div
            className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[120%] h-64 opacity-30"
            style={{
              background: 'radial-gradient(ellipse 60% 80% at 50% 0%, rgba(244, 63, 94, 0.15) 0%, transparent 70%)',
            }}
            aria-hidden
          />

          <div className="relative text-center space-y-4">
            <p className="label-caps">{SITE_NAME}</p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight gradient-title">Party games</h1>
            <p className="text-muted text-sm sm:text-base max-w-md mx-auto leading-relaxed">
              Pick a mode, create a room, share the code. Every game is free and runs in the browser.
            </p>
            <Link href="/create" className="btn-primary btn-fit">
              Create any game
            </Link>
          </div>

          <div className="relative grid sm:grid-cols-2 gap-3">
            {games.map(({ slug, content, cfg }) => (
              <Link
                key={slug}
                href={`/games/${slug}`}
                className="glass-card glass-card-interactive p-5 space-y-3 group"
                style={{ '--accent': cfg.card.accent } as React.CSSProperties}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
                    style={{ background: cfg.card.accentSoft }}
                  >
                    {cfg.card.emoji}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <h2 className="font-bold text-body leading-tight group-hover:text-[var(--primary)] transition-colors">
                      {content.heroTitle}
                    </h2>
                    <p className="text-faint text-xs">
                      {cfg.card.players} · {cfg.card.vibe}
                    </p>
                  </div>
                </div>
                <p className="text-muted text-sm leading-relaxed line-clamp-2">{content.heroSubtitle}</p>
                <span className="text-xs font-semibold text-[var(--primary)]">Learn more →</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
