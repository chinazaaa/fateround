import Link from 'next/link'
import { SiteChrome } from '@/components/SiteChrome'
import { SITE_NAME } from '@/lib/seo'

/**
 * Shared shell for the long-form static pages — Privacy, Terms, Contact, FAQ.
 * Keeps the eyebrow/title/updated-date rhythm identical across all of them.
 */
export function ContentPage({
  eyebrow,
  title,
  intro,
  lastUpdated,
  children,
}: {
  eyebrow: string
  title: string
  intro?: React.ReactNode
  lastUpdated?: string
  children: React.ReactNode
}) {
  return (
    <SiteChrome>
      <article className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl">{title}</h1>
        {lastUpdated && <p className="mt-3 text-sm text-[var(--muted)]">Last updated: {lastUpdated}</p>}

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-[var(--foreground)]">
          {intro}
          {children}
        </div>

        <p className="mt-12 text-sm">
          <Link href="/" className="font-semibold text-[var(--primary)] underline">
            ← Back to {SITE_NAME}
          </Link>
        </p>
      </article>
    </SiteChrome>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">{title}</h2>
      {children}
    </section>
  )
}

/** Inline mailto styled to match the rest of the prose. */
export function MailLink({ address }: { address: string }) {
  return (
    <a href={`mailto:${address}`} className="font-semibold text-[var(--primary)] underline">
      {address}
    </a>
  )
}
