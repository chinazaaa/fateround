import type { Metadata } from 'next'
import Link from 'next/link'
import { ContentPage } from '@/components/content/ContentPage'
import { FaqList } from '@/components/marketing/FaqList'
import { SITE_NAME, faqPageJsonLd, breadcrumbJsonLd } from '@/lib/seo'
import { SITE_FAQ_GROUPS, ALL_SITE_FAQS } from '@/lib/site-faq'

export const metadata: Metadata = {
  title: 'FAQ & Help',
  description: `Answers to common questions about ${SITE_NAME} — how rooms work, whether you need an account, spectators, custom questions, tournaments, and content ratings.`,
  alternates: { canonical: '/faq' },
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
      <ContentPage
        eyebrow="Help"
        title="Frequently asked questions"
        intro={
          <>
            <p>
              Everything people usually ask about playing and hosting on {SITE_NAME}. If your question is not here, the{' '}
              <Link href="/contact" className="font-semibold text-[var(--primary)] underline">
                contact page
              </Link>{' '}
              will get you to a human.
            </p>
            <nav aria-label="Jump to a section" className="flex flex-wrap gap-2">
              {SITE_FAQ_GROUPS.map((group) => (
                <a key={group.id} href={`#${group.id}`} className="fr-chip !text-[13px] no-underline">
                  {group.title}
                </a>
              ))}
            </nav>
          </>
        }
      >
        {SITE_FAQ_GROUPS.map((group) => (
          <section key={group.id} id={group.id} className="scroll-mt-24">
            <h2 className="mb-3 text-xl font-semibold tracking-tight text-[var(--foreground)]">{group.title}</h2>
            <FaqList faqs={group.faqs} />
          </section>
        ))}

        <section>
          <h2 className="mb-3 text-xl font-semibold tracking-tight text-[var(--foreground)]">
            Looking for a specific game?
          </h2>
          <p>
            Every game has its own page with full rules and its own FAQ — browse them all in the{' '}
            <Link href="/games" className="font-semibold text-[var(--primary)] underline">
              games directory
            </Link>
            .
          </p>
        </section>
      </ContentPage>
    </>
  )
}
