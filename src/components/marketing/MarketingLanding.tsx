import Link from 'next/link'
import { MarketingHeader } from '@/components/MarketingHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { faqPageJsonLd, breadcrumbJsonLd } from '@/lib/seo'
import type { MarketingPageContent } from '@/lib/marketing-landing'
import { FaqList } from '@/components/marketing/FaqList'
import { featureIcon } from '@/lib/feature-icons'
import { Glyph } from '@/components/icons/Glyph'

function PrimaryCtas({ primary }: { primary?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap justify-center gap-2.5">
      <Link href={primary?.href ?? '/create'} className="fr-btn fr-btn--primary fr-btn--lg">
        {primary?.label ?? 'Create a free room'}
      </Link>
      <Link href="/games" className="fr-btn fr-btn--secondary fr-btn--lg">
        Browse games
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

      <div
        className="fr-site flex min-h-dvh flex-col"
        style={
          {
            '--accent': accent,
            '--accent-soft': `color-mix(in srgb, ${accent} 14%, transparent)`,
          } as React.CSSProperties
        }
      >
        <MarketingHeader />

        <main className="flex-1">
          {/* ── Main Hero & Content Section ── */}
          <section className="fr-band fr-band--tight">
            <div className="mk-wrap">
              {/* Hero */}
              <div className="mb-8 space-y-2 text-center">
                <h1
                  className="fr-display m-0 text-[2.5rem] leading-[0.975] tracking-[-0.045em] sm:text-5xl"
                  style={{ color: 'var(--text)' }}
                >
                  {content.heroTitle}
                </h1>
                <p className="mx-auto max-w-xl text-sm" style={{ color: 'var(--text-muted)' }}>
                  {content.heroSubtitle}
                </p>
                <div className="pt-2">
                  <PrimaryCtas primary={content.primaryCta} />
                </div>
                <p className="text-[12.5px] pt-1" style={{ color: 'var(--text-faint)' }}>
                  Free forever · No sign-up · No download · Real-time
                </p>
              </div>

              <div className="mx-auto max-w-2xl space-y-10">
                {/* Highlights */}
                {content.highlights.length > 0 && (
                  <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex flex-wrap justify-center gap-2">
                      {content.highlights.map((h) => (
                        <span key={h} className="fr-chip !text-[13px]">
                          {h}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {/* Feature cards */}
                {content.featureCards.length > 0 && (
                  <section>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {content.featureCards.map((f) => {
                        const icon = featureIcon(f.emoji)
                        return (
                          <div
                            key={f.title}
                            className="fr-gamecard cursor-default"
                            style={{ '--accent': accent } as React.CSSProperties}
                          >
                            <span className="fr-glyph">
                              {icon ? <Glyph icon={icon} size={20} /> : <span className="text-xl">{f.emoji}</span>}
                            </span>
                            <h2 className="fr-gamecard__title text-[15px]">{f.title}</h2>
                            <p className="fr-gamecard__tagline text-[13.5px] leading-[1.5]">{f.description}</p>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                {/* How it works */}
                {content.steps.length > 0 && (
                  <section>
                    <h2 className="sec-title-fr" style={{ color: accent }}>
                      {content.stepsHeading}
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
                            style={{ background: accent }}
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
                )}

                {/* Body copy */}
                {content.body && (
                  <section className="pt-4">
                    <div
                      className="space-y-4 text-[15px] leading-[1.65] [&_a]:font-semibold [&_strong]:text-[color:var(--text)]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {content.body}
                    </div>
                  </section>
                )}

                {/* Comparison table */}
                {content.comparison && (
                  <section>
                    <h2 className="sec-title-fr" style={{ color: accent }}>
                      {content.comparison.heading}
                    </h2>
                    <div
                      className="overflow-x-auto rounded-[var(--radius-lg)]"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                      <table className="w-full border-collapse text-left text-sm">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th className="p-3 font-semibold" style={{ color: 'var(--text-faint)' }} />
                            <th className="p-3 font-bold" style={{ color: accent }}>
                              {content.comparison.columns[0]}
                            </th>
                            <th className="p-3 font-bold" style={{ color: 'var(--text)' }}>
                              {content.comparison.columns[1]}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {content.comparison.rows.map((row) => (
                            <tr
                              key={row.label}
                              className="align-top"
                              style={{ borderBottom: '1px solid var(--border)' }}
                            >
                              <td className="whitespace-nowrap p-3 font-semibold" style={{ color: 'var(--text)' }}>
                                {row.label}
                              </td>
                              <td className="p-3" style={{ color: 'var(--text-muted)' }}>
                                {row.a}
                              </td>
                              <td className="p-3" style={{ color: 'var(--text-muted)' }}>
                                {row.b}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {content.comparison.note && (
                      <p className="mt-3 text-center text-xs italic" style={{ color: 'var(--text-faint)' }}>
                        {content.comparison.note}
                      </p>
                    )}
                  </section>
                )}

                {/* Game list */}
                {content.gameList && (
                  <section>
                    <h2 className="sec-title-fr" style={{ color: accent }}>
                      {content.gameList.heading}
                    </h2>
                    <ul className="flex flex-col gap-2.5">
                      {content.gameList.items.map((item, i) => (
                        <li
                          key={i}
                          className="flex gap-2.5 text-[15px] leading-[1.6]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <span
                            className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: accent }}
                            aria-hidden
                          />
                          <span>
                            <span className="font-bold" style={{ color: 'var(--text)' }}>
                              {item.game}
                            </span>{' '}
                            — {item.description}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {content.gameList.footnote && (
                      <p className="mt-3 text-sm italic leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        {content.gameList.footnote}
                      </p>
                    )}
                  </section>
                )}

                {/* FAQ */}
                {content.faqs.length > 0 && (
                  <section>
                    <h2 className="sec-title-fr" style={{ color: accent }}>
                      Frequently asked questions
                    </h2>
                    <FaqList faqs={content.faqs} />
                  </section>
                )}

                {/* Final CTA */}
                <div
                  className="fr-gamecard cursor-default mx-auto max-w-[520px] p-8 text-center"
                  style={{ '--accent': accent } as React.CSSProperties}
                >
                  <h2 className="fr-gamecard__title text-[26px] mb-1">{content.ctaHeading}</h2>
                  <p className="fr-gamecard__tagline text-sm mb-4">{content.ctaSubtext}</p>
                  <div className="flex justify-center">
                    <PrimaryCtas primary={content.primaryCta} />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </>
  )
}
