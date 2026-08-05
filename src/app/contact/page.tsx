import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteChrome } from '@/components/SiteChrome'
import { Glyph } from '@/components/icons/Glyph'
import { Mail01Icon, Flag02Icon, LockPasswordIcon, GlobeIcon } from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { SITE_NAME } from '@/lib/seo'
import { LEGAL_EMAIL, PRIVACY_EMAIL, SUPPORT_EMAIL, SOCIAL_LINKS } from '@/lib/contact'

export const metadata: Metadata = {
  title: 'Contact',
  description: `Get in touch with the ${SITE_NAME} team — support, bug reports, press, partnerships, and content reports.`,
  alternates: { canonical: '/contact' },
}

const ROUTES: { title: string; email: string; blurb: string; accent: string; icon: IconSvgElement }[] = [
  {
    title: 'Support & bug reports',
    email: SUPPORT_EMAIL,
    blurb:
      'Something broken, a game stuck mid-round, or a question the FAQ did not answer. Include the room code and roughly when it happened — it makes problems far easier to trace.',
    accent: '#f43f5e',
    icon: Mail01Icon,
  },
  {
    title: 'Report content or a player',
    email: LEGAL_EMAIL,
    blurb:
      'Harassment, abusive content, or anything that breaks our Terms. Send the room code and a screenshot if you have one.',
    accent: '#f59e0b',
    icon: Flag02Icon,
  },
  {
    title: 'Privacy & data requests',
    email: PRIVACY_EMAIL,
    blurb: 'Access, correction, or deletion of your data, and any other question about how we handle it.',
    accent: '#0ea5e9',
    icon: LockPasswordIcon,
  },
  {
    title: 'Schools, press & partnerships',
    email: SUPPORT_EMAIL,
    blurb: 'Running a school championship, writing about us, or want to work together — this inbox reaches a human.',
    accent: '#10b981',
    icon: GlobeIcon,
  },
]

export default function ContactPage() {
  return (
    <SiteChrome>
      {/* ── Main content ── */}
      <div className="fr-band fr-band--tight">
        <div className="mk-wrap">
          {/* ── Hero section ── */}
          <div className="mb-8 space-y-2 text-center">
            <span className="fr-glyph">
              <Glyph icon={Mail01Icon} size={26} />
            </span>
            <h1
              className="fr-display m-0 text-[2.5rem] leading-[0.975] tracking-[-0.045em] sm:text-5xl"
              style={{ color: 'var(--text)' }}
            >
              Contact us
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {SITE_NAME} is a small team. Email is the fastest way to reach us, and we read everything.
            </p>
          </div>

          <div className="mx-auto max-w-3xl space-y-10">
            {/* ── Contact cards ── */}
            <div className="grid gap-4 sm:grid-cols-2">
              {ROUTES.map((route) => (
                <div
                  key={route.title}
                  className="fr-gamecard cursor-default"
                  style={{ '--accent': route.accent } as React.CSSProperties}
                >
                  <div className="flex items-center gap-3">
                    <span className="fr-glyph">
                      <Glyph icon={route.icon} size={22} />
                    </span>
                    <h2 className="fr-gamecard__title text-[15px]">{route.title}</h2>
                  </div>
                  <p className="fr-gamecard__tagline text-sm leading-[1.55]">{route.blurb}</p>
                  <div className="fr-gamecard__meta mt-auto pt-2">
                    <a
                      href={`mailto:${route.email}`}
                      className="fr-gamecard__players font-semibold text-xs no-underline transition-opacity hover:opacity-80"
                      style={{
                        color: 'var(--accent)',
                        background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                      }}
                    >
                      {route.email}
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Before you email ── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold tracking-tight" style={{ color: 'var(--primary, #f43f5e)' }}>
                Before you email
              </h2>
              <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text)' }}>
                A lot of questions are already answered on our{' '}
                <Link href="/faq" className="font-semibold text-[var(--primary)] underline">
                  FAQ
                </Link>{' '}
                — how rooms work, whether you need an account, what happens when someone disconnects, and how to add
                your own questions to a game.
              </p>
            </section>

            {/* ── Find us elsewhere ── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold tracking-tight" style={{ color: 'var(--primary, #f43f5e)' }}>
                Find us elsewhere
              </h2>
              <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text)' }}>
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
            </section>
          </div>
        </div>
      </div>
    </SiteChrome>
  )
}
