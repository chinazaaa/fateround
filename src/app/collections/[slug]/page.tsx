import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteChrome } from '@/components/SiteChrome'
import { SITE_NAME, breadcrumbJsonLd } from '@/lib/seo'
import { gameTypeLabel } from '@/lib/game-types'
import { fetchCollectionBySlug, fetchCollectionDatasets, type CollectionDataset } from '@/lib/collections-server'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  let collection = null
  try {
    collection = await fetchCollectionBySlug(slug)
  } catch {
    // fall through to default
  }
  if (!collection) return { title: 'Collection not found' }
  return {
    title: collection.name,
    description:
      collection.description ??
      `${collection.name} — themed game packs from ${SITE_NAME}. Same games, tailored questions.`,
    alternates: { canonical: `/collections/${collection.slug}` },
  }
}

export default async function CollectionDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let collection = null
  let datasets: CollectionDataset[] = []
  try {
    collection = await fetchCollectionBySlug(slug)
    if (collection) datasets = await fetchCollectionDatasets(collection.id)
  } catch {
    // treat as not found below
  }
  if (!collection) notFound()

  // Group datasets by game type so each game's packs sit together.
  const byGame = new Map<string, CollectionDataset[]>()
  for (const d of datasets) {
    const list = byGame.get(d.game_type) ?? []
    list.push(d)
    byGame.set(d.game_type, list)
  }
  const groups = [...byGame.entries()]

  return (
    <SiteChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Collections', path: '/collections' },
            { name: collection.name, path: `/collections/${collection.slug}` },
          ]),
        }}
      />
      <div className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
        <Link href="/collections" className="text-sm font-semibold text-[var(--muted)] hover:underline">
          ← All collections
        </Link>
        <div className="mt-4 flex items-start gap-3">
          <div className="text-4xl">{collection.icon ?? '🎲'}</div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl">
              {collection.name}
            </h1>
            {collection.audience && (
              <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{collection.audience}</p>
            )}
          </div>
        </div>
        {collection.description && (
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--muted)]">{collection.description}</p>
        )}

        {groups.length === 0 ? (
          <p className="mt-12 text-[15px] text-[var(--muted)]">No games in this collection yet — check back soon.</p>
        ) : (
          <div className="mt-10 space-y-10">
            {groups.map(([gameType, packs]) => (
              <section key={gameType}>
                <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">
                  {gameTypeLabel(gameType) ?? gameType}
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {packs.map((p) => (
                    <Link
                      key={p.id}
                      href={`/create?pack=${p.id}&type=${p.game_type}`}
                      className="group surface-inset flex flex-col rounded-2xl p-5 transition-all hover:border-[var(--border-strong)]"
                    >
                      <h3 className="text-base font-bold text-[var(--foreground)]">{p.title}</h3>
                      {p.description && (
                        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--muted)]">{p.description}</p>
                      )}
                      <span className="mt-3 text-xs text-[var(--muted)]">{p.question_count} items</span>
                      <span className="mt-4 text-sm font-semibold text-[var(--primary)] group-hover:underline">
                        Play this →
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </SiteChrome>
  )
}
