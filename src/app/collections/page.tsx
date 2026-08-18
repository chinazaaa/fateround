import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteChrome } from '@/components/SiteChrome'
import { SITE_NAME, breadcrumbJsonLd } from '@/lib/seo'
import { fetchActiveCollections, type CollectionMeta } from '@/lib/collections-server'

// Collections are admin-managed and read from the DB — always fetch at request time so a new or
// edited collection appears without a redeploy (and to avoid the ISR baked-empty-at-build trap).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Game collections',
  description: `Themed game packs from ${SITE_NAME} — Church & youth, classroom, corporate icebreakers and more. Same games you know, tailored questions.`,
  alternates: { canonical: '/collections' },
}

export default async function CollectionsIndexPage() {
  let collections: CollectionMeta[] = []
  try {
    collections = await fetchActiveCollections()
  } catch {
    // DB unreachable / tables missing — render the empty state rather than 500.
  }

  return (
    <SiteChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Collections', path: '/collections' },
          ]),
        }}
      />
      <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Collections</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl">
          Game collections
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--muted)]">
          Themed packs that run on the games you already know — only the questions change. Pick a collection to see
          every game tailored for it.
        </p>

        {collections.length === 0 ? (
          <p className="mt-12 text-[15px] text-[var(--muted)]">No collections yet — check back soon.</p>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((c) => (
              <Link
                key={c.id}
                href={`/collections/${c.slug}`}
                className="group surface-inset flex flex-col rounded-2xl p-5 transition-all hover:border-[var(--border-strong)]"
              >
                <div className="text-3xl">{c.icon ?? '🎲'}</div>
                <h2 className="mt-3 text-lg font-bold text-[var(--foreground)]">{c.name}</h2>
                {c.audience && <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">{c.audience}</p>}
                {c.description && (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--muted)]">{c.description}</p>
                )}
                <span className="mt-4 text-sm font-semibold text-[var(--primary)] group-hover:underline">
                  Browse games →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </SiteChrome>
  )
}
