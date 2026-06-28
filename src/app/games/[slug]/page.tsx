import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { gameTypeConfig, gameTypeCreateParam, GAME_TYPE_DISPLAY_ORDER } from '@/lib/game-types'
import {
  ALL_GAME_LANDING_SLUGS,
  GAME_LANDING_CONTENT,
  getGameBodyParagraph,
  getGameFaqs,
  getGameLandingContent,
  type GameLandingContent,
} from '@/lib/game-landing'
import { SITE_NAME, faqPageJsonLd, gameJsonLd, gameLandingOgPath } from '@/lib/seo'
import { getGameLandingCustomContentHints } from '@/lib/custom-content-hints'
import { CustomContentAiTip } from '@/components/ui/CustomContentAiTip'
import { SiteFooter } from '@/components/SiteFooter'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  return ALL_GAME_LANDING_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const content = getGameLandingContent(slug)
  if (!content) return {}

  const cfg = gameTypeConfig(content.gameType)
  const ogPath = gameLandingOgPath(slug)

  return {
    title: content.seoTitle,
    description: content.seoDescription,
    keywords: content.keywords,
    alternates: { canonical: `/games/${slug}` },
    openGraph: {
      title: `${content.seoTitle} | ${SITE_NAME}`,
      description: content.seoDescription,
      url: `/games/${slug}`,
      images: [
        {
          url: ogPath,
          width: 1200,
          height: 630,
          alt: `${cfg.label} — free online party game on ${SITE_NAME}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${content.seoTitle} | ${SITE_NAME}`,
      description: content.seoDescription,
      images: [ogPath],
    },
  }
}

function gamePageJsonLd(content: GameLandingContent) {
  return gameJsonLd(content)
}

export default async function GameLandingRoute({ params }: Props) {
  const { slug } = await params
  const content = getGameLandingContent(slug)
  if (!content) notFound()

  const cfg = gameTypeConfig(content.gameType)
  const otherGames = GAME_TYPE_DISPLAY_ORDER.filter((t) => t !== content.gameType && t in GAME_LANDING_CONTENT)
  const bodyParagraph = getGameBodyParagraph(content)
  const faqs = getGameFaqs(content)
  const customContentHints = getGameLandingCustomContentHints(content.gameType)

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: gamePageJsonLd(content) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqPageJsonLd(faqs) }} />

      <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-3 pointer-events-none">
        <Link href="/" className="pointer-events-auto">
          <FateRoundLogo className="h-8 w-auto max-w-[9.5rem] sm:max-w-[11rem]" />
        </Link>
        <Link
          href="/games"
          className="pointer-events-auto text-faint text-xs font-medium hover:text-body transition-colors"
        >
          All games
        </Link>
      </header>

      <div className="page-wrap min-h-dvh pb-16">
        {/* Hero — compact; CTAs + rules above the fold */}
        <section className="relative px-4 pt-16 pb-6 overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background: `radial-gradient(ellipse 80% 60% at 50% -10%, ${cfg.card.accentSoft} 0%, transparent 70%)`,
            }}
          />

          <div className="relative z-10 mx-auto max-w-2xl text-center space-y-3">
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

            <h1 className="text-3xl sm:text-4xl font-black tracking-tight gradient-title leading-tight">
              {content.heroTitle}
            </h1>

            <p className="text-muted text-sm sm:text-base leading-relaxed max-w-md mx-auto">{content.heroSubtitle}</p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 sm:gap-3 pt-0.5 w-full sm:w-fit mx-auto">
              <Link href={`/create?type=${gameTypeCreateParam(content.gameType)}`} className="btn-primary btn-fit">
                Play free →
              </Link>
              <Link href="/" className="btn-secondary btn-fit">
                Join with code
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-faint text-xs tracking-wide">
              <span>Free forever · No sign-up · Real-time · Phone &amp; desktop</span>
              <span className="hidden sm:inline opacity-40" aria-hidden>
                ·
              </span>
              <a
                href="#rules"
                className="font-medium hover:opacity-80 transition-opacity"
                style={{ color: cfg.card.accent }}
              >
                Read game rules ↓
              </a>
            </div>
          </div>
        </section>

        {/* SEO body copy — below the fold */}
        <section className="px-4 pb-8 border-t border-theme pt-6">
          <div className="mx-auto max-w-2xl text-center space-y-4">
            <p className="text-muted text-sm sm:text-base leading-relaxed">{bodyParagraph}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {content.highlights.map((h) => (
                <span key={h} className="glass-card px-3 py-1.5 text-xs font-medium text-body">
                  {h}
                </span>
              ))}
            </div>
          </div>
        </section>

        {customContentHints.length > 0 && (
          <section className="px-4 pb-10">
            <div className="mx-auto max-w-2xl space-y-3">
              <h2 className="text-lg font-black text-center gradient-title-subtle">Make it your own</h2>
              <p className="text-muted text-sm text-center leading-relaxed">
                Use our built-in content or upload your own — any theme works.
              </p>
              <div className="space-y-3">
                {customContentHints.map((hint) => (
                  <CustomContentAiTip key={hint.headline} hint={hint} accent={cfg.card.accent} />
                ))}
              </div>
            </div>
          </section>
        )}

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

        {/* Game rules */}
        <section id="rules" className="px-4 pb-12 scroll-mt-24">
          <div className="mx-auto max-w-2xl space-y-6">
            <h2 className="text-xl font-black text-center gradient-title-subtle">Game rules &amp; how to play</h2>
            <div className="space-y-4">
              {content.rules.map((section) => (
                <div key={section.title} className="glass-card p-5 sm:p-6 space-y-3">
                  <h3
                    className="font-bold text-body text-base border-b border-theme pb-2"
                    style={{ borderColor: `${cfg.card.accent}30` }}
                  >
                    {section.title}
                  </h3>
                  <ul className="space-y-2">
                    {section.points.map((point) => (
                      <li key={point} className="flex gap-2.5 text-muted text-sm leading-relaxed">
                        <span
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: cfg.card.accent }}
                          aria-hidden
                        />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
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

        {/* FAQ */}
        <section className="px-4 pb-12">
          <div className="mx-auto max-w-2xl space-y-5">
            <h2 className="text-xl font-black text-center gradient-title-subtle">Frequently asked questions</h2>
            <dl className="space-y-4">
              {faqs.map((faq) => (
                <div key={faq.question} className="glass-card p-5 space-y-2">
                  <dt className="font-bold text-body">{faq.question}</dt>
                  <dd className="text-muted text-sm leading-relaxed">{faq.answer}</dd>
                </div>
              ))}
            </dl>
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

      <SiteFooter />
    </>
  )
}
