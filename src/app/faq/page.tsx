import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteChrome } from '@/components/SiteChrome'
import { Glyph } from '@/components/icons/Glyph'
import {
  QuestionIcon,
  RocketIcon,
  GameController01Icon,
  Quiz01Icon,
  ChampionIcon,
  RankingIcon,
  LockPasswordIcon,
  Calendar01Icon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { SITE_NAME, faqPageJsonLd, breadcrumbJsonLd } from '@/lib/seo'
import { SITE_FAQ_GROUPS, ALL_SITE_FAQS } from '@/lib/site-faq'
import { FaqAccordion } from '@/components/marketing/FaqAccordion'

export const metadata: Metadata = {
  title: 'FAQ & Help',
  description: `Answers to common questions about ${SITE_NAME} — how rooms work, whether you need an account, spectators, custom questions, tournaments, and content ratings.`,
  alternates: { canonical: '/faq' },
}

const FAQ_GROUP_CONFIG: Record<string, { icon: IconSvgElement; accent: string }> = {
  'getting-started': { icon: RocketIcon, accent: '#f43f5e' },
  'during-a-game': { icon: GameController01Icon, accent: '#0ea5e9' },
  content: { icon: Quiz01Icon, accent: '#8b5cf6' },
  hosting: { icon: ChampionIcon, accent: '#f59e0b' },
  trophies: { icon: RankingIcon, accent: '#ec4899' },
  'daily-challenges': { icon: Calendar01Icon, accent: '#6366f1' },
  privacy: { icon: LockPasswordIcon, accent: '#10b981' },
}

export default function FaqPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqPageJsonLd(ALL_SITE_FAQS) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'FAQ', path: '/faq' },
          ]),
        }}
      />
      <SiteChrome>
        {/* ── Main content ── */}
        <div className="fr-band fr-band--tight">
          <div className="mk-wrap">
            {/* ── Hero section ── */}
            <div className="mb-8 space-y-2 text-center">
              <span className="fr-glyph">
                <Glyph icon={QuestionIcon} size={26} />
              </span>
              <h1
                className="fr-display m-0 text-[2.5rem] leading-[0.975] tracking-[-0.045em] sm:text-5xl"
                style={{ color: 'var(--text)' }}
              >
                FAQ &amp; Help
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Everything people usually ask about playing and hosting on {SITE_NAME}.
              </p>
            </div>

            <div className="mx-auto max-w-3xl space-y-10">
              {/* ── FAQ sections ── */}
              {SITE_FAQ_GROUPS.map((group) => {
                const config = FAQ_GROUP_CONFIG[group.id] ?? { icon: QuestionIcon, accent: 'var(--primary)' }
                return (
                  <section key={group.id} id={group.id} className="scroll-mt-24">
                    <div className="mb-3 flex items-center gap-3">
                      <span className="fr-glyph">
                        <Glyph icon={config.icon} size={20} />
                      </span>
                      <h2 className="text-xl font-bold tracking-tight" style={{ color: config.accent }}>
                        {group.title}
                      </h2>
                    </div>
                    <FaqAccordion faqs={group.faqs} accent={config.accent} />
                  </section>
                )
              })}

              {/* ── Games directory callout ── */}
              <div className="fr-card space-y-3 text-center mx-auto max-w-lg">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  Looking for a specific game?
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Explore full rules, game tips, and FAQs for any title.
                </p>
                <Link
                  href="/games"
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/25"
                >
                  Browse all games
                </Link>
              </div>

              {/* ── Contact callout ── */}
              <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                Can&apos;t find your answer?{' '}
                <Link href="/contact" className="font-semibold underline" style={{ color: 'var(--primary)' }}>
                  Contact us
                </Link>{' '}
                and we&apos;ll get back to you.
              </p>
            </div>
          </div>
        </div>
      </SiteChrome>
    </>
  )
}
