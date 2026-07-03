import Link from 'next/link'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { SiteFooter } from '@/components/SiteFooter'
import { faqPageJsonLd, breadcrumbJsonLd } from '@/lib/seo'
import type { MarketingPageContent } from '@/lib/marketing-landing'

function PrimaryCtas() {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 sm:gap-3 w-full sm:w-fit mx-auto">
      <Link href="/create" className="btn-primary btn-fit">
        Create a free room →
      </Link>
      <Link href="/games" className="btn-secondary btn-fit">
        Browse 20+ games
      </Link>
    </div>
  )
}

export function MarketingLanding({ content }: { content: MarketingPageContent }) {
  const { accent } = content

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: content.breadcrumbName, path: `/${content.slug}` },
          ]),
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqPageJsonLd(content.faqs) }} />

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
        {/* Hero */}
        <section className="relative px-4 pt-16 pb-6 overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{ background: `radial-gradient(ellipse 80% 60% at 50% -10%, ${accent}33 0%, transparent 70%)` }}
            aria-hidden
          />
          <div className="relative z-10 mx-auto max-w-2xl text-center space-y-4">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight gradient-title leading-tight">
              {content.heroTitle}
            </h1>
            <p className="text-muted text-sm sm:text-base leading-relaxed max-w-md mx-auto">{content.heroSubtitle}</p>
            <div className="pt-0.5">
              <PrimaryCtas />
            </div>
            <p className="text-faint text-xs tracking-wide">Free forever · No sign-up · No download · Real-time</p>
          </div>
        </section>

        {/* Highlights */}
        <section className="px-4 pb-8 border-t border-theme pt-6">
          <div className="mx-auto max-w-2xl flex flex-wrap justify-center gap-2">
            {content.highlights.map((h) => (
              <span key={h} className="glass-card px-3 py-1.5 text-xs font-medium text-body">
                {h}
              </span>
            ))}
          </div>
        </section>

        {/* Feature cards */}
        <section className="px-4 pb-14">
          <div className="mx-auto max-w-3xl">
            <div className="grid sm:grid-cols-2 gap-3">
              {content.featureCards.map((f) => (
                <div key={f.title} className="glass-card p-5 space-y-2 border-l-[3px]" style={{ borderLeftColor: accent }}>
                  <span className="text-2xl" aria-hidden>
                    {f.emoji}
                  </span>
                  <h2 className="font-bold text-body">{f.title}</h2>
                  <p className="text-muted text-sm leading-relaxed">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="px-4 pb-12">
          <div className="mx-auto max-w-2xl glass-card-strong p-6 sm:p-8 space-y-6">
            <h2 className="text-xl font-black text-center gradient-title-subtle">{content.stepsHeading}</h2>
            <ol className="space-y-5">
              {content.steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white"
                    style={{ background: accent }}
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

        {/* Body copy */}
        <section className="px-4 pb-12">
          <div className="mx-auto max-w-2xl space-y-4 text-muted text-sm sm:text-base leading-relaxed [&_p]:leading-relaxed">
            {content.body}
          </div>
        </section>

        {/* Comparison table */}
        {content.comparison && (
          <section className="px-4 pb-12">
            <div className="mx-auto max-w-2xl space-y-4">
              <h2 className="text-xl font-black text-center gradient-title-subtle">{content.comparison.heading}</h2>
              <div className="glass-card overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-theme">
                      <th className="p-3 font-semibold text-faint" />
                      <th className="p-3 font-bold text-body" style={{ color: accent }}>
                        {content.comparison.columns[0]}
                      </th>
                      <th className="p-3 font-bold text-body">{content.comparison.columns[1]}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {content.comparison.rows.map((row) => (
                      <tr key={row.label} className="border-b border-theme last:border-0 align-top">
                        <td className="p-3 font-semibold text-body whitespace-nowrap">{row.label}</td>
                        <td className="p-3 text-muted">{row.a}</td>
                        <td className="p-3 text-muted">{row.b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {content.comparison.note && (
                <p className="text-faint text-xs text-center italic">{content.comparison.note}</p>
              )}
            </div>
          </section>
        )}

        {/* Game list */}
        {content.gameList && (
          <section className="px-4 pb-12">
            <div className="mx-auto max-w-2xl space-y-4">
              <h2 className="text-xl font-black text-center gradient-title-subtle">{content.gameList.heading}</h2>
              <ul className="space-y-2.5">
                {content.gameList.items.map((item, i) => (
                  <li key={i} className="flex gap-2.5 text-muted text-sm sm:text-base leading-relaxed">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} aria-hidden />
                    <span>
                      <span className="font-bold text-body">{item.game}</span> — {item.description}
                    </span>
                  </li>
                ))}
              </ul>
              {content.gameList.footnote && (
                <p className="text-muted text-sm leading-relaxed italic">{content.gameList.footnote}</p>
              )}
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="px-4 pb-12">
          <div className="mx-auto max-w-2xl space-y-5">
            <h2 className="text-xl font-black text-center gradient-title-subtle">Frequently asked questions</h2>
            <dl className="space-y-4">
              {content.faqs.map((faq) => (
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
            style={{ borderColor: `${accent}35`, background: `linear-gradient(165deg, ${accent}1f 0%, transparent 70%)` }}
          >
            <p className="text-2xl font-black gradient-title-subtle">{content.ctaHeading}</p>
            <p className="text-muted text-sm">{content.ctaSubtext}</p>
            <PrimaryCtas />
          </div>
        </section>
      </div>

      <SiteFooter />
    </>
  )
}
