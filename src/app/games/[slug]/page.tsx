import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { gameTypeConfig } from '@/lib/game-types'
import {
  ALL_GAME_LANDING_SLUGS,
  GAME_LANDING_CONTENT,
  getGameLandingContent,
  type GameLandingContent,
} from '@/lib/game-landing'
import { SITE_NAME, OG_IMAGE } from '@/lib/seo'
import { appOrigin } from '@/lib/site'
import type { GameType } from '@/types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  return ALL_GAME_LANDING_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const content = getGameLandingContent(slug)
  if (!content) return {}

  return {
    title: content.seoTitle,
    description: content.seoDescription,
    keywords: content.keywords,
    alternates: { canonical: `/games/${slug}` },
    openGraph: {
      title: `${content.seoTitle} | ${SITE_NAME}`,
      description: content.seoDescription,
      url: `/games/${slug}`,
      images: [OG_IMAGE],
    },
  }
}

function gamePageJsonLd(content: GameLandingContent) {
  const cfg = gameTypeConfig(content.gameType)
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: content.seoTitle,
    description: content.seoDescription,
    url: `${appOrigin()}/games/${content.slug}`,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: appOrigin() },
    about: {
      '@type': 'Game',
      name: cfg.label,
      description: content.heroSubtitle,
      gamePlatform: 'Web browser',
      numberOfPlayers: cfg.card.players,
    },
  })
}

export default async function GameLandingRoute({ params }: Props) {
  const { slug } = await params
  const content = getGameLandingContent(slug)
  if (!content) notFound()

  const cfg = gameTypeConfig(content.gameType)
  const otherGames = (Object.keys(GAME_LANDING_CONTENT) as GameType[]).filter((t) => t !== content.gameType)

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: gamePageJsonLd(content) }} />

      <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-3 pointer-events-none">
        <Link href="/" className="pointer-events-auto">
          <FateRoundLogo className="h-8 w-auto max-w-[9.5rem] sm:max-w-[11rem]" />
        </Link>
        <Link href="/games" className="pointer-events-auto text-faint text-xs font-medium hover:text-body transition-colors">
          All games
        </Link>
      </header>

      <div className="page-wrap min-h-dvh pb-16">
        {/* Hero */}
        <section className="relative pt-28 pb-16 px-4 overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background: `radial-gradient(ellipse 80% 60% at 50% -10%, ${cfg.card.accentSoft} 0%, transparent 70%)`,
            }}
          />
          <div
            className="pointer-events-none absolute -top-8 left-[10%] text-6xl opacity-[0.07] select-none"
            aria-hidden
          >
            {cfg.card.emoji}
          </div>
          <div
            className="pointer-events-none absolute top-24 right-[8%] text-5xl opacity-[0.05] select-none"
            aria-hidden
          >
            {cfg.headerEmoji}
          </div>

          <div className="relative z-10 mx-auto max-w-2xl text-center space-y-6">
            <div
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
              style={{
                borderColor: `${cfg.card.accent}40`,
                background: cfg.card.accentSoft,
                color: cfg.card.accent,
              }}
            >
              <span>{cfg.card.emoji}</span>
              <span>{cfg.card.vibe}</span>
              <span className="opacity-60">·</span>
              <span className="opacity-80">{cfg.card.players}</span>
            </div>

            <div className="text-5xl sm:text-6xl tracking-tight" aria-hidden>
              {cfg.headerEmoji}
            </div>

            <h1 className="text-3xl sm:text-5xl font-black tracking-tight gradient-title leading-[1.05]">
              {content.heroTitle}
            </h1>

            <p className="text-muted text-base sm:text-lg leading-relaxed max-w-lg mx-auto">{content.heroSubtitle}</p>

            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {content.highlights.map((h) => (
                <span key={h} className="glass-card px-3 py-1.5 text-xs font-medium text-body">
                  {h}
                </span>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 w-fit mx-auto">
              <Link href={`/create?type=${content.gameType}`} className="btn-primary btn-fit">
                Play free →
              </Link>
              <Link href="/" className="btn-secondary btn-fit">
                Join with code
              </Link>
            </div>

            <p className="text-faint text-xs tracking-wide pt-1">
              Free forever · No sign-up · Real-time · Phone & desktop
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="px-4 pb-14">
          <div className="mx-auto max-w-3xl">
            <h2 className="label-caps text-center mb-6">Why play on Fate Round</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {content.features.map((f) => (
                <div
                  key={f.title}
                  className="glass-card p-5 space-y-2 border-l-[3px]"
                  style={{ borderLeftColor: cfg.card.accent }}
                >
                  <span className="text-2xl" aria-hidden>
                    {f.emoji}
                  </span>
                  <h3 className="font-bold text-body">{f.title}</h3>
                  <p className="text-muted text-sm leading-relaxed">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="px-4 pb-12">
          <div className="mx-auto max-w-2xl glass-card-strong p-6 sm:p-8 space-y-6">
            <h2 className="text-xl font-black text-center gradient-title-subtle">How it works</h2>
            <ol className="space-y-5">
              {content.steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white"
                    style={{ background: cfg.card.accent }}
                  >
                    {i + 1}
                  </span>
                  <div className="space-y-0.5 pt-0.5">
                    <h3 className="font-bold text-body">{step.title}</h3>
                    <p className="text-muted text-sm leading-relaxed">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Perfect for */}
        <section className="px-4 pb-12">
          <div className="mx-auto max-w-2xl text-center space-y-4">
            <h2 className="label-caps">Perfect for</h2>
            <div className="flex flex-wrap justify-center gap-2">
              {content.perfectFor.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-theme px-4 py-2 text-sm font-medium text-body"
                  style={{ background: cfg.card.accentSoft }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-14">
          <div
            className="mx-auto max-w-xl rounded-2xl border p-8 text-center space-y-4"
            style={{
              borderColor: `${cfg.card.accent}35`,
              background: `linear-gradient(165deg, ${cfg.card.accentSoft} 0%, transparent 70%)`,
            }}
          >
            <p className="text-2xl font-black gradient-title-subtle">Ready to play?</p>
            <p className="text-muted text-sm">Free forever. No download. Start a room in under a minute.</p>
            <Link href={`/create?type=${content.gameType}`} className="btn-primary btn-fit">
              Create {cfg.label} game
            </Link>
          </div>
        </section>

        {/* Other games */}
        <section className="px-4 pb-8 border-t border-theme pt-10">
          <div className="mx-auto max-w-3xl space-y-4">
            <h2 className="label-caps text-center">More party games</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {otherGames.map((type) => {
                const other = GAME_LANDING_CONTENT[type]
                const otherCfg = gameTypeConfig(type)
                return (
                  <Link
                    key={type}
                    href={`/games/${other.slug}`}
                    className="glass-card glass-card-interactive p-3 text-center space-y-2"
                    style={{ '--accent': otherCfg.card.accent } as React.CSSProperties}
                  >
                    <span
                      className="flex h-10 w-10 mx-auto items-center justify-center rounded-xl text-xl"
                      style={{ background: otherCfg.card.accentSoft }}
                    >
                      {otherCfg.card.emoji}
                    </span>
                    <span className="text-xs font-semibold leading-tight block">{otherCfg.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
