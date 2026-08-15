import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MarketingHeader } from '@/components/MarketingHeader'
import { gameTypeConfig, gameTypeCreateParam, GAME_TYPE_DISPLAY_ORDER } from '@/lib/game-types'
import { soloPlaySlug } from '@/lib/solo-play'
import {
  ALL_GAME_LANDING_SLUGS,
  GAME_LANDING_CONTENT,
  getGameBodyParagraph,
  getGameFaqs,
  getGameLandingContent,
  type GameLandingContent,
} from '@/lib/game-landing'
import { SITE_NAME, faqPageJsonLd, gameJsonLd, gameLandingOgPath, breadcrumbJsonLd, gameHowToJsonLd } from '@/lib/seo'
import { getGameLandingCustomContentHints } from '@/lib/custom-content-hints'
import { CustomContentAiTip } from '@/components/ui/CustomContentAiTip'
import { SiteFooter } from '@/components/SiteFooter'
import {
  isMatureGame,
  matureGameReason,
  MATURE_BADGE_LABEL,
  MATURE_NOTICE_BODY,
  MATURE_NOTICE_TITLE,
} from '@/lib/game-maturity'
import { FaqList } from '@/components/marketing/FaqList'
import { MafiaRolesLanding } from '@/components/mafia/MafiaRolesLanding'
import { GameLandingTrophies } from '@/components/marketing/GameLandingTrophies'
import { gameIcon } from '@/lib/game-glyphs'
import { featureIcon } from '@/lib/feature-icons'
import { Glyph } from '@/components/icons/Glyph'
import { DAILY_GAME_LABELS, DAILY_GAME_TYPE_TO_SLUG } from '@/lib/daily-challenge'

const GAME_TO_DAILY: Partial<Record<string, string[]>> = {
  sudoku: ['sudoku'],
  word_hunt: ['word_hunt'],
  crossword: ['crossword', 'mini_crossword'],
  word_search: ['word_search'],
  word_scramble: ['word_scramble'],
  trivia: ['trivia'],
  whot: ['whot_puzzle'],
  chess: ['chess_mate'],
  codewords: ['codenames_codeword'],
  ludo: ['ludo_puzzle'],
  word_grouping: ['word_grouping'],
}

export const revalidate = 3600

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
  const dailyTypes = GAME_TO_DAILY[content.gameType]
  const dailyLinks = dailyTypes?.map((dt) => ({
    slug: DAILY_GAME_TYPE_TO_SLUG[dt as keyof typeof DAILY_GAME_TYPE_TO_SLUG],
    label: DAILY_GAME_LABELS[dt as keyof typeof DAILY_GAME_LABELS],
  }))

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: gamePageJsonLd(content) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: gameHowToJsonLd(content) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqPageJsonLd(faqs) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'All games', path: '/games' },
            { name: cfg.label, path: `/games/${content.slug}` },
          ]),
        }}
      />

      <div
        className="fr-site flex min-h-dvh flex-col"
        style={{ '--accent': cfg.card.accent, '--accent-soft': cfg.card.accentSoft } as React.CSSProperties}
      >
        <MarketingHeader />

        <main className="flex-1">
          {/* ── Main Hero Section ── */}
          <section className="fr-band fr-band--tight">
            <div className="mk-wrap">
              <div className="mx-auto max-w-[680px] text-center">
                <div className="mb-3 space-y-2">
                  <span className="fr-glyph">
                    <Glyph icon={gameIcon(content.gameType)} size={28} />
                  </span>
                  <div>
                    <span
                      className="inline-flex items-center gap-[7px] rounded-full px-3.5 py-1.5 text-[12.5px] font-bold"
                      style={{
                        border: `1px solid color-mix(in srgb, var(--accent) 35%, transparent)`,
                        background: 'var(--accent-soft)',
                        color: 'var(--accent)',
                      }}
                    >
                      <span>{cfg.card.vibe}</span>
                      <span className="opacity-50">·</span>
                      <span className="opacity-80">{cfg.card.players}</span>
                    </span>
                  </div>
                </div>

                {isMatureGame(content.gameType) && (
                  <div
                    className="mx-auto mb-4 max-w-[30rem] rounded-[14px] px-4 py-3 text-left"
                    style={{
                      background: 'color-mix(in srgb, var(--danger, #dc2626) 8%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--danger, #dc2626) 25%, transparent)',
                    }}
                  >
                    <p className="text-[13px] font-bold" style={{ color: 'var(--danger, #dc2626)' }}>
                      <span aria-hidden>🔞</span> {MATURE_BADGE_LABEL} · {MATURE_NOTICE_TITLE}
                    </p>
                    <p className="mt-1 text-[13px] leading-[1.5]" style={{ color: 'var(--text-muted)' }}>
                      {matureGameReason(content.gameType)} {MATURE_NOTICE_BODY}
                    </p>
                  </div>
                )}

                <h1
                  className="fr-display m-0 text-[2.375rem] leading-[1.02] tracking-[-0.035em] sm:text-[2.875rem]"
                  style={{ color: 'var(--text)' }}
                >
                  {content.heroTitle}
                </h1>

                <p
                  className="mx-auto mt-3 mb-6 max-w-[28rem] text-base leading-[1.55]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {content.heroSubtitle}
                </p>

                <div className="mb-4 flex flex-wrap justify-center gap-2.5">
                  <Link
                    href={`/create?type=${gameTypeCreateParam(content.gameType)}`}
                    className="fr-btn fr-btn--primary fr-btn--lg"
                  >
                    Play free
                  </Link>
                  <Link href="/" className="fr-btn fr-btn--secondary fr-btn--lg">
                    Join with code
                  </Link>
                </div>

                {/* Solo practice + game rules — quieter third/fourth CTAs below
                    the primary "Play free" / "Join with code" pair. Underlined
                    and each on its own line so it's obvious they're two
                    separate links, not one run-on button. */}
                <div className="flex flex-col items-center gap-1.5 text-[13px]">
                  {soloPlaySlug(content.gameType) ? (
                    <Link
                      href={`/play-solo/${soloPlaySlug(content.gameType)}`}
                      className="font-semibold underline underline-offset-4"
                      style={{ color: 'var(--accent)' }}
                    >
                      Practice against the bot →
                    </Link>
                  ) : null}
                  <a
                    href="#rules"
                    className="font-semibold underline underline-offset-4"
                    style={{ color: 'var(--accent)' }}
                  >
                    Read game rules ↓
                  </a>
                </div>
              </div>

              {dailyLinks && dailyLinks.length > 0 && (
                <div
                  className="mx-auto mt-6 max-w-[520px] rounded-[var(--radius-lg)] px-5 py-4 text-center"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--border))',
                  }}
                >
                  <p className="text-[14px] leading-[1.55]" style={{ color: 'var(--text-muted)' }}>
                    Fancy a solo brain-teaser? Try the daily{' '}
                    {dailyLinks.map((dl, i) => (
                      <span key={dl.slug}>
                        {i > 0 && (i === dailyLinks.length - 1 ? ' or ' : ', ')}
                        <Link
                          href={`/daily-challenges/${dl.slug}`}
                          className="font-semibold no-underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          {dl.label}
                        </Link>
                      </span>
                    ))}
                    {!dailyLinks[dailyLinks.length - 1].label.toLowerCase().includes('puzzle') && ' puzzle'}&nbsp;→
                  </p>
                </div>
              )}

              <div className="mx-auto max-w-[680px] space-y-10 pt-8">
                {/* SEO body */}
                <section className="border-t pt-6 text-center" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-[15px] leading-[1.65]" style={{ color: 'var(--text-muted)' }}>
                    {bodyParagraph}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {content.highlights.map((h) => (
                      <span key={h} className="fr-chip !text-[13px]">
                        {h}
                      </span>
                    ))}
                  </div>
                </section>

                {customContentHints.length > 0 && (
                  <section>
                    <h2 className="sec-title-fr" style={{ color: 'var(--accent)' }}>
                      Make it your own
                    </h2>
                    <p
                      className="-mt-2 mb-4 text-center text-sm leading-relaxed"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Use our built-in content or upload your own — any theme works.
                    </p>
                    <div className="space-y-3">
                      {customContentHints.map((hint) => (
                        <CustomContentAiTip key={hint.headline} hint={hint} accent={cfg.card.accent} />
                      ))}
                    </div>
                  </section>
                )}

                {/* How it works */}
                <section>
                  <h2 className="sec-title-fr" style={{ color: 'var(--accent)' }}>
                    How it works
                  </h2>
                  <div
                    className="rounded-[var(--radius-lg)] p-6"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    {content.steps.map((step, i) => (
                      <div key={step.title} className="flex gap-4 py-[11px]">
                        <div
                          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold text-white"
                          style={{ background: 'var(--accent)' }}
                        >
                          {i + 1}
                        </div>
                        <div>
                          <h3 className="mb-[3px] mt-0.5 text-[15.5px] font-bold" style={{ color: 'var(--text)' }}>
                            {step.title}
                          </h3>
                          <p className="text-sm leading-[1.5]" style={{ color: 'var(--text-muted)' }}>
                            {step.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {content.gameType === 'mafia' && <MafiaRolesLanding />}

                {/* Game rules */}
                <section id="rules" className="scroll-mt-24">
                  <h2 className="sec-title-fr" style={{ color: 'var(--accent)' }}>
                    Game rules &amp; how to play
                  </h2>
                  {content.rules.map((section) => (
                    <div
                      key={section.title}
                      className="mb-3 rounded-[var(--radius-lg)] px-[22px] py-5"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid color-mix(in srgb, var(--accent) 25%, var(--border))',
                      }}
                    >
                      <h3
                        className="mb-3 pb-[9px] text-[15.5px] font-bold"
                        style={{
                          color: 'var(--accent)',
                          borderBottom: '1px solid color-mix(in srgb, var(--accent) 22%, var(--border))',
                        }}
                      >
                        {section.title}
                      </h3>
                      <ul className="flex flex-col gap-[9px]">
                        {section.points.map((point) => (
                          <li
                            key={point}
                            className="flex gap-[11px] text-sm leading-[1.5]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <span
                              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: 'var(--accent)' }}
                              aria-hidden
                            />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>

                <GameLandingTrophies gameType={content.gameType} />

                {content.relatedBlogPosts && content.relatedBlogPosts.length > 0 && (
                  <section>
                    <div className="flex flex-wrap justify-center gap-2">
                      {content.relatedBlogPosts.map((post) => (
                        <Link
                          key={post.slug}
                          href={`/blog/${post.slug}`}
                          className="fr-chip !text-[13px] no-underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          {post.label}
                        </Link>
                      ))}
                    </div>
                  </section>
                )}

                {/* Features */}
                <section>
                  <h2 className="sec-title-fr" style={{ color: 'var(--accent)' }}>
                    Why play on FateRound
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {content.features.map((feature) => {
                      const icon = featureIcon(feature.emoji)
                      return (
                        <div
                          key={feature.title}
                          className="fr-gamecard cursor-default"
                          style={{ '--accent': 'var(--accent)' } as React.CSSProperties}
                        >
                          <span className="fr-glyph">
                            {icon ? <Glyph icon={icon} size={20} /> : <span className="text-xl">{feature.emoji}</span>}
                          </span>
                          <h3 className="fr-gamecard__title text-[15px]">{feature.title}</h3>
                          <p className="fr-gamecard__tagline text-[13.5px] leading-[1.5]">{feature.description}</p>
                        </div>
                      )
                    })}
                  </div>
                </section>

                {/* Perfect for */}
                <section>
                  <h2 className="sec-title-fr" style={{ color: 'var(--accent)' }}>
                    Perfect for
                  </h2>
                  <div className="flex flex-wrap justify-center gap-2">
                    {content.perfectFor.map((item) => (
                      <span key={item} className="fr-chip !text-[13px]">
                        {item}
                      </span>
                    ))}
                  </div>
                </section>

                {/* FAQ */}
                <section>
                  <h2 className="sec-title-fr" style={{ color: 'var(--accent)' }}>
                    Frequently asked questions
                  </h2>
                  <FaqList faqs={faqs} />
                  <p className="mt-4 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>
                    More questions?{' '}
                    <Link href="/faq" className="font-semibold no-underline" style={{ color: 'var(--accent)' }}>
                      Read the full FAQ
                    </Link>
                  </p>
                </section>

                {/* Final CTA */}
                <div
                  className="fr-gamecard cursor-default mx-auto max-w-[520px] p-8 text-center"
                  style={{ '--accent': 'var(--accent)' } as React.CSSProperties}
                >
                  <h2 className="fr-gamecard__title text-[26px] mb-1">Ready to play?</h2>
                  <p className="fr-gamecard__tagline text-sm mb-4">
                    Free forever. No download. Start a room in under a minute.
                  </p>
                  <div className="flex justify-center">
                    <Link
                      href={`/create?type=${gameTypeCreateParam(content.gameType)}`}
                      className="fr-btn fr-btn--primary fr-btn--lg"
                    >
                      Create {cfg.label} game
                    </Link>
                  </div>
                </div>

                {/* More games */}
                <section className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                  <h2 className="sec-title-fr" style={{ color: 'var(--accent)' }}>
                    More party games
                  </h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {otherGames.map((type) => {
                      const other = GAME_LANDING_CONTENT[type]
                      const otherCfg = gameTypeConfig(type)
                      return (
                        <Link
                          key={type}
                          href={`/games/${other.slug}`}
                          className="fr-gamecard no-underline text-center flex flex-col items-center"
                          style={{ '--accent': otherCfg.card.accent } as React.CSSProperties}
                        >
                          <span className="fr-glyph mb-1">
                            <Glyph icon={gameIcon(type)} size={22} />
                          </span>
                          <span className="fr-gamecard__title text-xs">{otherCfg.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </section>
              </div>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </>
  )
}
