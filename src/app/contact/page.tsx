import type { Metadata } from 'next'
import Link from 'next/link'
import { ContentPage, Section, MailLink } from '@/components/content/ContentPage'
import { SITE_NAME } from '@/lib/seo'
import { LEGAL_EMAIL, PRIVACY_EMAIL, SUPPORT_EMAIL, SOCIAL_LINKS } from '@/lib/contact'

export const metadata: Metadata = {
  title: 'Contact',
  description: `Get in touch with the ${SITE_NAME} team — support, bug reports, press, partnerships, and content reports.`,
  alternates: { canonical: '/contact' },
}

const ROUTES: { title: string; email: string; blurb: string }[] = [
  {
    title: 'Support & bug reports',
    email: SUPPORT_EMAIL,
    blurb:
      'Something broken, a game stuck mid-round, or a question the FAQ did not answer. Include the room code and roughly when it happened — it makes problems far easier to trace.',
  },
  {
    title: 'Report content or a player',
    email: LEGAL_EMAIL,
    blurb:
      'Harassment, abusive content, or anything that breaks our Terms. Send the room code and a screenshot if you have one.',
  },
  {
    title: 'Privacy & data requests',
    email: PRIVACY_EMAIL,
    blurb: 'Access, correction, or deletion of your data, and any other question about how we handle it.',
  },
  {
    title: 'Schools, press & partnerships',
    email: SUPPORT_EMAIL,
    blurb: 'Running a school championship, writing about us, or want to work together — this inbox reaches a human.',
  },
]

export default function ContactPage() {
  return (
    <ContentPage
      eyebrow="Support"
      title="Contact us"
      intro={
        <p>
          {SITE_NAME} is a small team. Email is the fastest way to reach us, and we read everything. Pick the inbox that
          fits and we will get back to you — usually within a few working days.
        </p>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {ROUTES.map((route) => (
          <div
            key={route.title}
            className="rounded-[var(--radius-lg,14px)] px-[18px] py-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>
              {route.title}
            </h2>
            <p className="mt-1 text-sm leading-[1.55]" style={{ color: 'var(--text-muted)' }}>
              {route.blurb}
            </p>
            <p className="mt-2 text-sm">
              <MailLink address={route.email} />
            </p>
          </div>
        ))}
      </div>

      <Section title="Before you email">
        <p>
          A lot of questions are already answered on our{' '}
          <Link href="/faq" className="font-semibold text-[var(--primary)] underline">
            FAQ
          </Link>{' '}
          — how rooms work, whether you need an account, what happens when someone disconnects, and how to add your own
          questions to a game.
        </p>
      </Section>

      <Section title="Find us elsewhere">
        <p>
          We post new games and updates on{' '}
          <a
            href={SOCIAL_LINKS.tiktok}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--primary)] underline"
          >
            TikTok
          </a>{' '}
          and{' '}
          <a
            href={SOCIAL_LINKS.x}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--primary)] underline"
          >
            X
          </a>
          . You can also see what we have shipped recently on the{' '}
          <Link href="/updates" className="font-semibold text-[var(--primary)] underline">
            updates page
          </Link>
          .
        </p>
      </Section>
    </ContentPage>
  )
}
